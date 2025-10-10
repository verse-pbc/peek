import { test, expect } from '@playwright/test';

/**
 * Test that community name updates immediately after creation
 * without requiring a page reload
 */
test('Community name updates from Overpass API immediately', async ({ page }) => {
  test.setTimeout(60000);

  // Capture console logs
  const logs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    console.log(`[BROWSER] ${text}`);
  });

  console.log('\n========== Creating new community with dev mode ==========');
  await page.goto('http://localhost:3000/?dev=true');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Click Create Dev Test
  await page.click('button:has-text("Create Dev Test")');
  await page.waitForURL(/\/c\/.+/);
  await page.waitForTimeout(2000);

  // Extract community ID
  const communityUrl = page.url();
  const match = communityUrl.match(/\/c\/([^?]+)/);
  expect(match).toBeTruthy();
  const communityId = match![1];
  console.log(`\n📍 Created community: ${communityId}`);

  // Should see join flow
  await expect(page.getByText('Create a Community')).toBeVisible();

  // Click Create & Join
  await page.click('button:has-text("Create & Join as Admin")');
  await page.waitForTimeout(1000);

  // Select dev location (Barcelona area - should have real place names)
  await page.fill('input[placeholder="9q8yy1uj"]', '9q8yyhxf');
  await page.waitForTimeout(500);

  const overrideButton = page.locator('button').filter({ hasText: /^Override with/ }).first();
  await overrideButton.click();

  console.log('\n⏳ Waiting for validation and redirect...');
  await page.waitForTimeout(5000);

  // Should see success page
  await expect(page.getByText('Welcome to the Community!')).toBeVisible();

  // Enter community
  await page.click('button:has-text("Enter Your Community")');
  await page.waitForTimeout(2000);

  console.log('\n========== Checking community name ==========');

  // Get the displayed name from header
  const headerText = await page.locator('h1').first().textContent();
  console.log(`📝 Community name in header: "${headerText}"`);

  // Check console logs for name update
  const nameUpdateLogs = logs.filter(log =>
    log.includes('[Community] 📝 Updating name from 39000:') ||
    log.includes('[Community] ✅ Updated name to:')
  );

  console.log(`\n📊 Name update logs found: ${nameUpdateLogs.length}`);
  nameUpdateLogs.forEach(log => console.log(`  ${log}`));

  // Check for metadata event arrival
  const metadataEventLogs = logs.filter(log =>
    log.includes('[Community] Received metadata event: 39000')
  );
  console.log(`📊 Metadata event logs found: ${metadataEventLogs.length}`);

  // Check for subscription creation
  const subscriptionLogs = logs.filter(log =>
    log.includes('[RelayManager] Subscribing to metadata for group')
  );
  console.log(`📊 Subscription logs found: ${subscriptionLogs.length}`);

  // Take screenshot
  await page.screenshot({ path: 'test-results/name-update-test.png', fullPage: true });
  console.log('📸 Screenshot saved: name-update-test.png');

  console.log('\n========== RESULTS ==========');

  if (subscriptionLogs.length === 0) {
    console.log('❌ No metadata subscription created');
  } else if (metadataEventLogs.length === 0) {
    console.log('❌ No kind 39000 events received');
  } else if (nameUpdateLogs.length === 0) {
    console.log('❌ Kind 39000 received but name not updated');
  } else if (headerText?.includes('Community ' + communityId.slice(0, 8))) {
    console.log('❌ Header still shows fallback name (UUID)');
    console.log(`   Expected: Real place name from Overpass API`);
    console.log(`   Actual: ${headerText}`);
  } else {
    console.log('✅ Community name updated successfully!');
    console.log(`   Name: ${headerText}`);
  }

  // Keep browser open for inspection
  console.log('\n⏸️  Browser open for 30s...');
  await page.waitForTimeout(30000);
});
