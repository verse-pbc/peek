import { test, expect } from '@playwright/test';
import { generateTestIdentity } from './helpers/identity';

test.describe('Complete Peek Journey', () => {
  let communityId: string;
  let communityUrl: string;

  test('Full user journey: create → migrate → multi-user → location failure', async ({ browser }) => {
    // ============================================
    // ACT 1: Anonymous Founder Creates Community
    // ============================================
    const founderContext = await browser.newContext();
    const founderPage = await founderContext.newPage();

    await founderPage.goto('/?dev=true');

    // Verify anonymous state
    await expect(founderPage.getByText('Anonymous')).toBeVisible();
    await expect(founderPage.getByText('0 joined')).toBeVisible();

    // Create new community
    await founderPage.click('button:has-text("Create Dev Test")');
    await founderPage.waitForURL(/\/c\/.+/);

    // Extract community ID
    communityUrl = founderPage.url();
    const match = communityUrl.match(/\/c\/([^?]+)/);
    expect(match).toBeTruthy();
    communityId = match![1];
    console.log('[E2E] Created community:', communityId);

    // Verify new community preview
    await expect(founderPage.getByText('New Community')).toBeVisible();
    await expect(founderPage.getByText('You\'ll be admin')).toBeVisible();
    await expect(founderPage.getByText('0')).toBeVisible(); // 0 members
    await expect(founderPage.getByText('Be the first member!')).toBeVisible();

    // Join as founder
    await founderPage.click('button:has-text("Create & Join as Admin")');
    await founderPage.waitForTimeout(1000);

    // Select dev location
    const overrideButton = founderPage.locator('button').filter({ hasText: /^Override with/ }).first();
    await overrideButton.click();
    await founderPage.waitForTimeout(8000); // Wait for validation

    // Verify success
    await expect(founderPage.getByText('Welcome to the Community!')).toBeVisible();
    await expect(founderPage.getByText('You\'re the Founder!')).toBeVisible();

    // Enter community
    await founderPage.click('button:has-text("Enter Your Community")');
    await founderPage.waitForTimeout(2000);

    // Verify we're on /c/{uuid} (not /community/)
    expect(founderPage.url()).toContain(`/c/${communityId}`);
    expect(founderPage.url()).not.toContain('/community/');

    // Verify community page UI
    await expect(founderPage.getByText('My Communities')).toBeVisible(); // Not "Back"
    await expect(founderPage.getByText('Founder')).toBeVisible(); // Founder badge

    // Post first message
    const messageInput = founderPage.locator('input[placeholder="Type a message..."]');
    await expect(messageInput).toBeVisible();
    await messageInput.fill('Hello from the founder!');
    await messageInput.press('Enter');
    await founderPage.waitForTimeout(2000);

    // Verify message posted
    await expect(founderPage.getByText('Hello from the founder!')).toBeVisible();

    // ============================================
    // ACT 2: Identity Migration (Founder Upgrades)
    // ============================================
    const newIdentity = generateTestIdentity();
    console.log('[E2E] Generated new identity:', newIdentity.npub);

    // Open identity menu
    const identityButton = founderPage.locator('button').filter({ hasText: /Anonymous|Temp/ }).first();
    await identityButton.click();

    // Click upgrade option
    await founderPage.click('text=Upgrade to Personal Identity');
    await founderPage.waitForTimeout(500);

    // Verify modal opened
    const nsecInput = founderPage.locator('input[type="password"]');
    await expect(nsecInput).toBeVisible();

    // Import new identity
    await nsecInput.fill(newIdentity.nsec);
    await founderPage.click('button:has-text("Import")');
    await founderPage.waitForTimeout(3000); // Wait for kind:1776 event

    // Verify migration completed
    await expect(founderPage.getByText('Anonymous')).not.toBeVisible();
    await expect(founderPage.getByText('Temp')).not.toBeVisible();

    // Verify previous message still visible (migration preserved membership)
    await expect(founderPage.getByText('Hello from the founder!')).toBeVisible();

    // Post post-migration message
    await messageInput.fill('After migration!');
    await messageInput.press('Enter');
    await founderPage.waitForTimeout(2000);

    // Verify both messages visible
    await expect(founderPage.getByText('Hello from the founder!')).toBeVisible();
    await expect(founderPage.getByText('After migration!')).toBeVisible();

    // ============================================
    // ACT 3: Second User Joins Existing Community
    // ============================================
    const userBContext = await browser.newContext();
    const userBPage = await userBContext.newPage();

    await userBPage.goto(`/c/${communityId}?dev=true`);
    await userBPage.waitForTimeout(2000);

    // Verify shows existing community (not "New Community")
    await expect(userBPage.getByText('New Community')).not.toBeVisible();

    // Should show member count > 0
    const bodyText = await userBPage.textContent('body');
    expect(bodyText).toMatch(/[1-9]\d* member/); // 1+ members

    // Join community
    await userBPage.click('button:has-text("Join Community")');
    await userBPage.waitForTimeout(1000);

    // Select same location
    const userBOverrideButton = userBPage.locator('button').filter({ hasText: /^Override with/ }).first();
    await userBOverrideButton.click();
    await userBPage.waitForTimeout(8000);

    // Verify success (but not founder)
    await expect(userBPage.getByText('Welcome to the Community!')).toBeVisible();
    await expect(userBPage.getByText('You\'re the Founder!')).not.toBeVisible();

    // Enter community
    await userBPage.click('button:has-text("Enter Your Community")');
    await userBPage.waitForTimeout(2000);

    // Verify URL stayed on /c/
    expect(userBPage.url()).toContain(`/c/${communityId}`);

    // Verify sees founder's messages
    await expect(userBPage.getByText('Hello from the founder!')).toBeVisible();
    await expect(userBPage.getByText('After migration!')).toBeVisible();

    // Verify member count updated
    const headerText = await userBPage.textContent('body');
    expect(headerText).toMatch(/2 member/);

    // Post message as User B
    const userBInput = userBPage.locator('input[placeholder="Type a message..."]');
    await userBInput.fill('User B joined!');
    await userBInput.press('Enter');
    await userBPage.waitForTimeout(2000);

    // Verify all messages visible
    await expect(userBPage.getByText('Hello from the founder!')).toBeVisible();
    await expect(userBPage.getByText('After migration!')).toBeVisible();
    await expect(userBPage.getByText('User B joined!')).toBeVisible();

    // ============================================
    // ACT 4: Real-Time Updates Verification
    // ============================================
    // Switch back to founder's context
    await founderPage.bringToFront();
    await founderPage.waitForTimeout(3000); // Wait for WebSocket sync

    // Founder should see User B's message
    await expect(founderPage.getByText('User B joined!')).toBeVisible();

    // Verify member count updated for founder
    const founderBodyText = await founderPage.textContent('body');
    expect(founderBodyText).toMatch(/2 member/);

    // ============================================
    // ACT 5: Location Validation Failure (User C)
    // ============================================
    const userCContext = await browser.newContext();
    const userCPage = await userCContext.newPage();

    await userCPage.goto(`/c/${communityId}?dev=true`);
    await userCPage.waitForTimeout(2000);

    // Click join
    await userCPage.click('button:has-text("Join Community")');
    await userCPage.waitForTimeout(1000);

    // Select WRONG location (not the "Override with" button)
    // Find any geohash button that's NOT the centered one
    const allGeohashButtons = await userCPage.locator('button').filter({ hasText: /^eyzv[a-z0-9]{4}$/ }).all();
    // Skip the first one (which is likely the "Override with" one)
    const wrongLocationButton = allGeohashButtons[allGeohashButtons.length - 1];
    await wrongLocationButton.click();

    // Wait for validation to fail (may timeout)
    await userCPage.waitForTimeout(10000);

    // Check for error (could be on join page or error page)
    const errorPageText = await userCPage.textContent('body');
    expect(errorPageText).toMatch(/too far|location|distance|accuracy|Unable to Join|Error/i);

    // Verify URL still on /c/ (didn't redirect home)
    expect(userCPage.url()).toContain(`/c/${communityId}`);

    // ============================================
    // ACT 6: Successful Retry After Failure
    // ============================================
    // Look for retry button
    const hasRetryButton = await userCPage.getByText('Try Again').isVisible().catch(() => false);

    if (hasRetryButton) {
      await userCPage.click('button:has-text("Try Again")');
      await userCPage.waitForTimeout(1000);

      // Select correct location this time
      const retryOverrideButton = userCPage.locator('button').filter({ hasText: /^Override with/ }).first();
      await retryOverrideButton.click();
      await userCPage.waitForTimeout(8000);

      // Verify success
      await expect(userCPage.getByText('Welcome to the Community!')).toBeVisible();

      // Enter community
      await userCPage.click('button:has-text("Enter Your Community")');
      await userCPage.waitForTimeout(2000);

      // Verify all previous messages visible
      await expect(userCPage.getByText('Hello from the founder!')).toBeVisible();
      await expect(userCPage.getByText('User B joined!')).toBeVisible();

      // Verify 3 members
      const finalBodyText = await userCPage.textContent('body');
      expect(finalBodyText).toMatch(/3 member/);
    }

    // Cleanup
    await userCPage.close();
    await userCContext.close();
    await userBPage.close();
    await userBContext.close();
    await founderPage.close();
    await founderContext.close();

    console.log('[E2E] ✅ Complete journey test passed');
  });
});
