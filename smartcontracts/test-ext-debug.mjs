import { chromium } from 'playwright';

const METAMASK_PATH = '/home/g/projects/metamask-chrome-13.24.0';
const USER_DATA_DIR = '/tmp/daskibo-debug-profile';

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    args: [
      `--load-extension=${METAMASK_PATH}`,
      `--disable-extensions-except=${METAMASK_PATH}`,
      '--no-first-run',
    ],
    ignoreDefaultArgs: ['--disable-extensions', '--enable-automation', '--disable-component-extensions-with-background-pages'],
    viewport: { width: 1280, height: 800 },
  });

  console.log('Browser launched');
  await new Promise(r => setTimeout(r, 5000));

  console.log('Pages:', context.pages().map(p => p.url()));
  console.log('ServiceWorkers:', context.serviceWorkers().map(sw => sw.url()));

  // Try navigating to chrome://extensions
  const p = await context.newPage();
  await p.goto('chrome://extensions');
  await new Promise(r => setTimeout(r, 2000));
  const content = await p.content();
  console.log('Extensions page length:', content.length);
  await p.screenshot({ path: '/tmp/debug-extensions.png' });
  console.log('Screenshot: /tmp/debug-extensions.png');

  // Check all pages
  console.log('\nAll pages:');
  for (const page of context.pages()) {
    console.log(' ', page.url());
  }

  await new Promise(r => setTimeout(r, 3000));
  await context.close();
})();
