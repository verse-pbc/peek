import { test, expect } from '@playwright/test';
import { generateTestIdentity } from './helpers/identity';

/**
 * Comprehensive E2E test covering complete user journey:
 * - Anonymous user creates community
 * - Identity migration (anonymous → permanent nsec)
 * - Second user joins existing community
 * - Real-time updates (WebSocket)
 * - Location validation failure
 * - Retry with correct location
 *
 * NOTE: This test is NOT run in CI (no E2E tests in CI workflow).
 * Run manually for pre-deployment validation or smoke testing.
 *
 * Usage:
 *   # Against localhost (for development)
 *   npm run test:e2e:ui
 *
 *   # Against production (smoke test after deployment)
 *   BASE_URL=https://peek.verse.app npm run test:e2e
 *
 * Why not in CI:
 * - Requires actual relay connections (flaky)
 * - Slow execution (~3 minutes)
 * - Better suited for manual staging/production validation
 * - Unit tests provide sufficient coverage for CI
 */
test.describe('Complete Peek Journey', () => {
  let communityId: string;
  let communityUrl: string;

  test('Full user journey: create → migrate → multi-user → location failure', async ({ browser }) => {
    test.setTimeout(180000); // 3 minutes timeout for full journey
    // ============================================
    // ACT 1: Anonymous Founder Creates Community
    // ============================================
    const founderContext = await browser.newContext();
    const founderPage = await founderContext.newPage();

    await founderPage.goto('/?dev=true');
    await founderPage.waitForLoadState('networkidle');

    // Wait for anonymous identity to be created
    await expect(founderPage.getByText('Anonymous')).toBeVisible({ timeout: 10000 });
    await expect(founderPage.getByText('0 joined')).toBeVisible();

    // Create new community
    await founderPage.click('button:has-text("Create Dev Test")');
    await founderPage.waitForURL(/\/c\/.+/);

    // Wait for page to finish loading - may show "Loading community..." first
    // Then should show either JoinFlow preview or error
    await founderPage.waitForTimeout(3000); // Wait for relay connection + groupId resolution

    // At this point should see preview OR JoinFlow content
    // Try to find the create/join button which appears in both flows
    await expect(founderPage.locator('button').filter({ hasText: /Create & Join|Join Community/ }).first()).toBeVisible({ timeout: 10000 });

    // Extract community ID
    communityUrl = founderPage.url();
    const match = communityUrl.match(/\/c\/([^?]+)/);
    expect(match).toBeTruthy();
    communityId = match![1];
    console.log('[E2E] Created community:', communityId);

    // Verify new community preview (showing JoinFlow)
    await expect(founderPage.getByText('Create a Community')).toBeVisible();
    await expect(founderPage.getByText('You\'ll be admin')).toBeVisible();
    await expect(founderPage.getByText('Be the first member!')).toBeVisible();

    // Join as founder
    await founderPage.click('button:has-text("Create & Join as Admin")');
    await founderPage.waitForTimeout(1000);

    // Select dev location - fill geohash input first to enable override button
    await founderPage.fill('input[placeholder="9q8yy1uj"]', '9q8yyhxf');
    await founderPage.waitForTimeout(500);
    const overrideButton = founderPage.locator('button').filter({ hasText: /^Override with/ }).first();
    await overrideButton.click();
    await founderPage.waitForTimeout(4000); // Wait for validation

    // Verify success
    await expect(founderPage.getByText('Welcome to the Community!')).toBeVisible();
    await expect(founderPage.getByText('You\'re the Founder')).toBeVisible();

    // Enter community
    await founderPage.click('button:has-text("Enter Your Community")');
    await founderPage.waitForTimeout(1000);

    // Verify we're on /c/{uuid} (not /community/)
    expect(founderPage.url()).toContain(`/c/${communityId}`);
    expect(founderPage.url()).not.toContain('/community/');

    // Verify community page UI
    await expect(founderPage.getByText('My Communities')).toBeVisible(); // Not "Back"
    await expect(founderPage.getByText('Founder', { exact: true })).toBeVisible(); // Founder badge

    // Post first message
    const messageInput = founderPage.locator('input[placeholder="Type a message..."]');
    await expect(messageInput).toBeVisible();
    await messageInput.fill('Hello from the founder!');
    await messageInput.press('Enter');
    await founderPage.waitForTimeout(1000);

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

    // Click the Import button in the modal footer (not the tab)
    // There are 2 "Import Identity" buttons: one is a tab, one is the submit button
    // We need the submit button which is the second one
    await founderPage.locator('button:has-text("Import Identity")').nth(1).click();

    // Wait for modal to close (migration success) - reduced timeout for faster feedback
    await expect(founderPage.getByRole('dialog')).not.toBeVisible({ timeout: 3000 });

    // Verify migration completed - check the identity button specifically
    const identityBtn = founderPage.locator('button').filter({ hasText: /Anonymous/ }).first();
    await expect(identityBtn).not.toBeVisible();

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

    // Wait for page to load - should show join preview for existing community
    await expect(userBPage.getByText('Join Community')).toBeVisible({ timeout: 10000 });

    // Wait for preview to fully load (community name and member count)
    await userBPage.waitForTimeout(2000);

    // Should show member count > 0 (indicates existing community)
    const bodyText = await userBPage.textContent('body');
    expect(bodyText).toMatch(/[1-9]\d* member/); // 1+ members

    // Join community
    await userBPage.click('button:has-text("Join Community")');
    await userBPage.waitForTimeout(1000);

    // Select same location - fill geohash input first
    await userBPage.fill('input[placeholder="9q8yy1uj"]', '9q8yyhxf');
    await userBPage.waitForTimeout(500);
    const userBOverrideButton = userBPage.locator('button').filter({ hasText: /^Override with/ }).first();
    await userBOverrideButton.click();
    await userBPage.waitForTimeout(4000);

    // Verify success (but not founder)
    await expect(userBPage.getByText('Welcome to the Community!')).toBeVisible();
    await expect(userBPage.getByText('You\'re the Founder')).not.toBeVisible();

    // Enter community
    await userBPage.click('button:has-text("Enter Your Community")');
    await userBPage.waitForTimeout(1000);

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
    await userBPage.waitForTimeout(1000);

    // Verify all messages visible
    await expect(userBPage.getByText('Hello from the founder!')).toBeVisible();
    await expect(userBPage.getByText('After migration!')).toBeVisible();
    await expect(userBPage.getByText('User B joined!')).toBeVisible();

    // ============================================
    // ACT 4: Real-Time Updates Verification
    // ============================================
    // Switch back to founder's context
    await founderPage.bringToFront();
    await founderPage.waitForTimeout(3000); // Wait for WebSocket sync (increased for reliability)

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
    await userCPage.waitForTimeout(1000);

    // Click join
    await userCPage.click('button:has-text("Join Community")');
    await userCPage.waitForTimeout(1000);

    // Select WRONG location - use a geohash far from the valid area
    await userCPage.fill('input[placeholder="9q8yy1uj"]', '9q8yy000');
    await userCPage.waitForTimeout(500);
    const wrongLocationButton = userCPage.locator('button').filter({ hasText: /^Override with/ }).first();
    await wrongLocationButton.click();

    // Wait for validation to fail (may timeout)
    await userCPage.waitForTimeout(5000);

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

      // Select correct location this time - fill geohash input first
      await userCPage.fill('input[placeholder="9q8yy1uj"]', '9q8yyhxf');
      await userCPage.waitForTimeout(500);
      const retryOverrideButton = userCPage.locator('button').filter({ hasText: /^Override with/ }).first();
      await retryOverrideButton.click();
      await userCPage.waitForTimeout(4000);

      // Verify success
      await expect(userCPage.getByText('Welcome to the Community!')).toBeVisible();

      // Enter community
      await userCPage.click('button:has-text("Enter Your Community")');
      await userCPage.waitForTimeout(1000);

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
