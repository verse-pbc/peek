import { test, expect } from '@playwright/test';

/**
 * Debug script to investigate why kind 9 events aren't displaying
 * in community 9e2d7f63-85c0-422e-a3ec-d5ea4a161ae7
 * for nsec nsec1gtx4g83gdp7vqtd8uhhpfnw07fslf5dvnwlu6jqxan5y0e2a2avqedaf73
 */
test('Debug message display for specific user and community', async ({ page }) => {
  test.setTimeout(120000); // 2 minutes

  const nsec = 'nsec1gtx4g83gdp7vqtd8uhhpfnw07fslf5dvnwlu6jqxan5y0e2a2avqedaf73';
  const communityId = '9e2d7f63-85c0-422e-a3ec-d5ea4a161ae7';

  // Capture console logs
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    console.log(`[BROWSER] ${text}`);
  });

  // Capture errors
  page.on('pageerror', error => {
    console.error(`[PAGE ERROR]`, error.message);
    consoleLogs.push(`ERROR: ${error.message}`);
  });

  console.log('\n========== STEP 1: Navigate to home ==========');
  await page.goto('http://localhost:3000/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Take screenshot of home page
  await page.screenshot({ path: 'test-results/debug-home.png', fullPage: true });
  console.log('📸 Screenshot saved: debug-home.png');

  console.log('\n========== STEP 2: Import identity ==========');

  // Check if already logged in or anonymous
  const identityButton = page.locator('button').filter({ hasText: /Anonymous|Temp|npub/ }).first();
  await expect(identityButton).toBeVisible({ timeout: 10000 });
  await identityButton.click();
  await page.waitForTimeout(500);

  // Look for "Upgrade to Personal Identity" or "Import Identity"
  const upgradeOption = page.getByText('Upgrade to Personal Identity');
  const importOption = page.getByText('Import Identity');

  if (await upgradeOption.isVisible().catch(() => false)) {
    console.log('Clicking "Upgrade to Personal Identity"');
    await upgradeOption.click();
  } else if (await importOption.isVisible().catch(() => false)) {
    console.log('Clicking "Import Identity"');
    await importOption.click();
  } else {
    console.log('⚠️  Could not find upgrade/import option');
  }

  await page.waitForTimeout(1000);

  // Fill nsec
  const nsecInput = page.locator('input[type="password"]');
  if (await nsecInput.isVisible().catch(() => false)) {
    console.log(`Filling nsec: ${nsec}`);
    await nsecInput.fill(nsec);

    // Click Import button (the submit button, not the tab)
    await page.locator('button:has-text("Import Identity")').nth(1).click();
    console.log('Clicked Import button');

    // Wait for modal to close or error
    await page.waitForTimeout(3000);
  } else {
    console.log('⚠️  nsec input not found - might already be logged in');
  }

  // Take screenshot after import
  await page.screenshot({ path: 'test-results/debug-after-import.png', fullPage: true });
  console.log('📸 Screenshot saved: debug-after-import.png');

  console.log('\n========== STEP 3: Navigate to community ==========');
  await page.goto(`http://localhost:3000/c/${communityId}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000); // Wait for subscriptions to establish

  // Take screenshot of community page
  await page.screenshot({ path: 'test-results/debug-community.png', fullPage: true });
  console.log('📸 Screenshot saved: debug-community.png');

  console.log('\n========== STEP 4: Analyze console logs ==========');

  // Filter relevant logs
  const connectionLogs = consoleLogs.filter(log => log.includes('[RelayManager] Connected'));
  const authLogs = consoleLogs.filter(log => log.includes('authenticated'));
  const subscribeLogs = consoleLogs.filter(log => log.includes('Subscribing to group'));
  const syncLogs = consoleLogs.filter(log => log.includes('Synced with group'));
  const handlerLogs = consoleLogs.filter(log => log.includes('Registering for events: kind-9'));
  const eventLogs = consoleLogs.filter(log =>
    log.includes('Received event for group') && log.includes(communityId.slice(0, 8))
  );
  const messageLogs = consoleLogs.filter(log => log.includes('Received chat message event'));
  const addMessageLogs = consoleLogs.filter(log => log.includes('Adding new message to UI'));
  const errorLogs = consoleLogs.filter(log => log.includes('ERROR') || log.includes('Error'));

  console.log('\n📊 LOG ANALYSIS:');
  console.log(`✅ Connection logs: ${connectionLogs.length}`);
  if (connectionLogs.length > 0) console.log(`   Latest: ${connectionLogs[connectionLogs.length - 1]}`);

  console.log(`✅ Auth logs: ${authLogs.length}`);
  if (authLogs.length > 0) console.log(`   Latest: ${authLogs[authLogs.length - 1]}`);

  console.log(`✅ Subscribe logs: ${subscribeLogs.length}`);
  subscribeLogs.forEach(log => console.log(`   ${log}`));

  console.log(`✅ Sync logs: ${syncLogs.length}`);
  syncLogs.forEach(log => console.log(`   ${log}`));

  console.log(`✅ Handler registration: ${handlerLogs.length}`);
  handlerLogs.forEach(log => console.log(`   ${log}`));

  console.log(`✅ Event logs (kind 9 for this group): ${eventLogs.length}`);
  eventLogs.slice(0, 5).forEach(log => console.log(`   ${log}`));

  console.log(`✅ Message handler logs: ${messageLogs.length}`);
  messageLogs.slice(0, 5).forEach(log => console.log(`   ${log}`));

  console.log(`✅ Add message logs: ${addMessageLogs.length}`);
  addMessageLogs.slice(0, 5).forEach(log => console.log(`   ${log}`));

  console.log(`❌ Error logs: ${errorLogs.length}`);
  errorLogs.forEach(log => console.log(`   ${log}`));

  console.log('\n========== STEP 5: Check UI state ==========');

  // Check if messages are visible
  const messageElements = await page.locator('[class*="break-words"]').count();
  console.log(`📝 Message elements found: ${messageElements}`);

  // Check for loading state
  const loadingText = await page.getByText('Loading messages...').isVisible().catch(() => false);
  console.log(`⏳ Loading state: ${loadingText}`);

  // Check for empty state
  const emptyText = await page.getByText('No messages yet').isVisible().catch(() => false);
  console.log(`📭 Empty state: ${emptyText}`);

  // Get visible text
  const bodyText = await page.locator('body').textContent();
  const hasMessages = bodyText && bodyText.includes('Type a message');
  console.log(`💬 Chat input visible: ${hasMessages}`);

  console.log('\n========== DIAGNOSIS ==========');

  if (subscribeLogs.length === 0) {
    console.log('❌ ISSUE: No subscription logs found - subscribeToGroup() not called');
  } else if (handlerLogs.length === 0) {
    console.log('❌ ISSUE: No handler registration logs - CommunityFeed not registering');
  } else if (eventLogs.length === 0) {
    console.log('❌ ISSUE: No kind 9 events arriving from relay');
  } else if (messageLogs.length === 0) {
    console.log('❌ ISSUE: Events arriving but handler not being called');
  } else if (addMessageLogs.length === 0) {
    console.log('❌ ISSUE: Handler called but messages not being added to state');
  } else if (messageElements === 0) {
    console.log('❌ ISSUE: Messages in state but not rendering');
  } else {
    console.log('✅ Messages are displaying correctly!');
  }

  // Keep browser open for manual inspection
  console.log('\n⏸️  Browser will stay open for 30 seconds for manual inspection...');
  await page.waitForTimeout(30000);
});
