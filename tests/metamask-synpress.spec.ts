import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { MetaMask, getExtensionId } from '@synthetixio/synpress/playwright';
import path from 'path';

let context: BrowserContext;
let metamaskPage: Page;
let metamask: MetaMask;
const password = 'correcthorsebatterystaple';
const seedPhrase = 'test test test test test test test test test test test junk';

test.describe('MetaMask and Synpress Integration Test', () => {
  test.beforeAll(async () => {
    const pathToExtension = path.resolve('scratch/metamask-extension/dist/chrome');
    console.log('Loading MetaMask extension from:', pathToExtension);

    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });

    // Retrieve extension ID
    const extensionId = await getExtensionId(context, 'MetaMask MV3 snow');
    console.log('MetaMask Extension ID:', extensionId);

    // Find MetaMask page or open it
    metamaskPage = context.pages().find((p) => p.url().includes('chrome-extension://')) || await context.newPage();
    if (!metamaskPage.url().includes('chrome-extension://')) {
      await metamaskPage.goto(`chrome-extension://${extensionId}/home.html`);
    }
    await metamaskPage.waitForLoadState('load');

    // Instantiate MetaMask control class from Synpress
    metamask = new MetaMask(context, metamaskPage, password, extensionId);
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  test('Verify MetaMask API and handles availability', async () => {
    console.log('Verifying Synpress MetaMask API...');

    // Print all available methods on the metamask instance
    const prototype = Object.getPrototypeOf(metamask);
    const methods = Object.getOwnPropertyNames(prototype)
      .filter((m) => typeof (metamask as any)[m] === 'function' && m !== 'constructor');
    
    console.log('--- AVAILABLE METAMASK METHODS ---');
    console.log(JSON.stringify(methods, null, 2));
    console.log('----------------------------------');

    expect(methods).toContain('importWallet');
    expect(methods).toContain('addNewAccount');
    expect(metamask.onboardingPage).toBeDefined();
    expect(metamask.homePage).toBeDefined();
    expect(metamask.settingsPage).toBeDefined();
    expect(metamask.notificationPage).toBeDefined();
  });

  test('Perform Wallet Import / Onboarding', async () => {
    test.setTimeout(120000); // Onboarding might take time
    console.log('Importing wallet...');
    await metamask.importWallet(seedPhrase);
    
    const address = await metamask.getAccountAddress();
    console.log('Imported wallet address:', address);
    expect(address).toBeTruthy();
    expect(address.startsWith('0x')).toBe(true);
  });

  test('Verify Account operations (Add and Switch)', async () => {
    test.setTimeout(60000);
    console.log('Adding new account...');
    await metamask.addNewAccount('Account 2');
    
    console.log('Switching back to Account 1...');
    await metamask.switchAccount('Account 1');
  });

  test('Verify Lock and Unlock operations', async () => {
    test.setTimeout(60000);
    console.log('Locking wallet...');
    await metamask.lock();

    console.log('Unlocking wallet...');
    await metamask.unlock();
  });
});
