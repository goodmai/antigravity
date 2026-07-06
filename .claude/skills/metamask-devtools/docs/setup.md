# MetaMask — Initial Setup (first run)

Run this when `.chrome-user-data` is fresh and MetaMask shows the onboarding screen.

## Check if onboarding is needed

```js
const needsOnboarding = await run(`
  !!document.querySelector('[data-testid="onboarding-terms-of-service-checkbox"]') ||
  !!document.querySelector('.onboarding')
`);
```

## Automated onboarding (import seed phrase)

```js
const SEED = 'cream timber combine fly ostrich animal sniff rice decade width glad author fresh dumb dune danger vital fetch mansion tip produce parade old pole';
const PASSWORD = process.env.METAMASK_PASSWORD;  // 1234567890

// 1. Accept terms of service
await run(`
  const cb = document.querySelector('[data-testid="onboarding-terms-of-service-checkbox"]');
  if (cb && !cb.checked) cb.click();
`);
await new Promise(r => setTimeout(r, 300));
await run(`document.querySelector('[data-testid="onboarding-terms-of-service-next-button"]')?.click()`);
await new Promise(r => setTimeout(r, 500));

// 2. Click "Import an existing wallet"
await run(`document.querySelector('[data-testid="onboarding-import-wallet"]')?.click()`);
await new Promise(r => setTimeout(r, 500));

// 3. Decline metrics
await run(`document.querySelector('[data-testid="metametrics-no-thanks"]')?.click()`);
await new Promise(r => setTimeout(r, 500));

// 4. Enter seed phrase words (MetaMask v13 = individual word inputs)
const words = SEED.split(' ');
await run(`
  (async () => {
    const words = ${JSON.stringify(words)};
    for (let i = 0; i < words.length; i++) {
      const inp = document.querySelector('[data-testid="import-srp__srp-word-' + i + '"]');
      if (inp) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(inp, words[i]);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await new Promise(r => setTimeout(r, 50));
    }
  })()
`);
await new Promise(r => setTimeout(r, 500));

// 5. Confirm seed phrase
await run(`document.querySelector('[data-testid="import-srp-confirm"]')?.click()`);
await new Promise(r => setTimeout(r, 800));

// 6. Set password
await run(`
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const p1 = document.querySelector('[data-testid="create-password-new"]');
  const p2 = document.querySelector('[data-testid="create-password-confirm"]');
  setter.call(p1, '${PASSWORD}');  p1.dispatchEvent(new Event('input', { bubbles: true }));
  setter.call(p2, '${PASSWORD}');  p2.dispatchEvent(new Event('input', { bubbles: true }));
  const terms = document.querySelector('[data-testid="create-password-terms"]');
  if (terms && !terms.checked) terms.click();
`);
await new Promise(r => setTimeout(r, 300));
await run(`document.querySelector('[data-testid="create-password-import"]')?.click()`);
await new Promise(r => setTimeout(r, 2000));

// 7. Skip completion screens
for (const id of ['onboarding-complete-done', 'pin-extension-done', 'pin-extension-next']) {
  await run(`document.querySelector('[data-testid="${id}"]')?.click()`);
  await new Promise(r => setTimeout(r, 800));
}
```
