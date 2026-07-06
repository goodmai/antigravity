# Raw CDP WebSocket Reference (MetaMask)

This reference documents the low-level Chrome DevTools Protocol (CDP) WebSocket communication used to drive MetaMask. 

> [!WARNING]
> For executing tasks, prefer using the unified `scripts/metamask-control.js` CLI wrapper over writing raw WebSocket scripts manually. The scripts below are kept as a reference for extending or debugging the CDP logic.

## 0. Launching Chrome Correctly

For CDP automation to work, Chrome must be launched with specific flags:

```bash
DISPLAY=:0 bash smartcontracts/start-chrome-dev.sh
```

**Critical flags**:
- `--user-data-dir=/home/g/projects/antigravity/.chrome-user-data` (keeps extension ID stable)
- `--load-extension=/home/g/projects/metamask-chrome-13.24.0`
- `--no-sandbox`
- **NO** `--disable-extensions-except` (blocks `home.html`)

## 1. Core CDP Helper Pattern

```js
import WebSocket from 'ws';

const MM_ID = process.env.METAMASK_EXT_ID ?? 'hebhblbkkdabgoldnojllkipeoacjioc';
const CDP   = 'http://127.0.0.1:9222';

export async function openMetaMask() {
  const tabs = await fetch(`${CDP}/json`).then(r => r.json());
  let mm = tabs.find(t => t.url?.startsWith(`chrome-extension://${MM_ID}/home.html`));

  if (!mm) {
    const { webSocketDebuggerUrl: bws } = await fetch(`${CDP}/json/version`).then(r => r.json());
    const bwsConn = new WebSocket(bws);
    await new Promise(r => bwsConn.on('open', r));
    bwsConn.send(JSON.stringify({ id: 1, method: 'Target.createTarget',
      params: { url: `chrome-extension://${MM_ID}/home.html` } }));
    await new Promise(r => bwsConn.on('message', m => { if(JSON.parse(m).id===1) r(); }));
    bwsConn.close();
    await new Promise(r => setTimeout(r, 1500));
    const tabs2 = await fetch(`${CDP}/json`).then(r => r.json());
    mm = tabs2.find(t => t.url?.startsWith(`chrome-extension://${MM_ID}/home.html`));
  }

  const ws = new WebSocket(mm.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  async function run(expression) {
    const id = Date.now();
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true } }));
    return new Promise((resolve, reject) => {
      const h = m => {
        const d = JSON.parse(m.toString());
        if (d.id !== id) return;
        ws.off('message', h);
        if (d.result?.exceptionDetails) reject(new Error(d.result.exceptionDetails.text));
        else resolve(d.result?.result?.value);
      };
      ws.on('message', h);
    });
  }
  return { ws, run, close: () => ws.close() };
}
```

## 2. React Input Manipulation

React inputs (like password or seed phrase boxes) do not update their internal state when you simply set `.value`. You must trigger native setters and dispatch an input event:

```js
await run(`
  const inp = document.querySelector('#private-key-box');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, '0xPrivateKey...');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
`);
```

## 3. Popup Handling

When the webapp invokes `wallet_requestPermissions` or sends a transaction, a new popup window opens.

```js
const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
const popup = tabs.find(t => t.url?.includes('chrome-extension') && t.url.includes('notification'));
if (popup) {
  const popupWs = new WebSocket(popup.webSocketDebuggerUrl);
  await new Promise(r => popupWs.on('open', r));
  // Find and click the confirm button
  await runOn(popupWs, `
    const btn = document.querySelector('[data-testid="confirmation-submit-button"]');
    if (btn) btn.click();
  `);
  popupWs.close();
}
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| MetaMask tab shows `ERR_BLOCKED_BY_CLIENT` | `--disable-extensions-except` flag blocks the extension's own page | Remove that flag from Chrome launch |
| Wrong MetaMask extension ID | Used a different Chrome `--user-data-dir` | Always use `.chrome-user-data`; ID is profile-bound |
| `list_extensions` gives "Method not available" | Chrome 148, Extensions CDP API needs Chrome 149+ | Use `Target.createTarget` + direct WebSocket instead |
| MetaMask not in `list_pages` | chrome-devtools-mcp filters extension pages | Access MetaMask only via raw CDP WebSocket |
| React inputs don't update after `.value =` | React controls input via internal state | Use prototype native setter + dispatch `input` event |
