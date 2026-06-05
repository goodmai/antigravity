/**
 * Shared Synpress test instance with Daskibo MetaMask setup.
 * Import this instead of @playwright/test in all Daskibo specs.
 */
import { testWithSynpress } from '@synthetixio/synpress'
import { MetaMask, metaMaskFixtures } from '@synthetixio/synpress/playwright'
import daskiboSetup from '../wallet-setup/daskibo.setup'
// @ts-ignore — plain-JS skill helper (CDP-driven, MM 13.24.0)
import { switchAccount as switchAccountCDP } from '../../../.claude/skills/metamask-devtools/scripts/metamask-control.js'

// ───────────────────────────────────────────────────────────────────────────
// MetaMask 13.24.0 method overrides.
//
// Synpress 0.0.14 ships page objects written for MetaMask 13.13.1; their
// selectors (account list, notification footer, connect/approve flows) no longer
// exist in 13.24.0, so switchAccount/connectToDapp/confirmTransaction/approve*
// all fail. We re-implement them here via raw CDP Runtime.evaluate (this build
// ships LavaMoat in scuttling mode, which blocks Playwright's page.evaluate).
// ───────────────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function cdpRunFor(page: any) {
  let session: any
  return async (expression: string) => {
    if (!session) session = await page.context().newCDPSession(page)
    const r: any = await session.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result?.value
  }
}

// Confirm/approve footer testids across the 13.24.0 notification surfaces.
const CONFIRM_TIDS = [
  'confirm-footer-button', 'confirm-btn', 'confirmation-submit-button',
  'page-container-footer-next', 'confirm-network-approve', 'submit-button',
]

// Find the MetaMask notification popup and click its confirm footer up to
// `clicks` times (connect/approve flows can be multi-step), stopping when the
// popup closes. Logs the available buttons if no confirm target is found.
async function driveNotification(context: any, extensionId: string | undefined, clicks: number) {
  if (!extensionId) throw new Error('MetaMask extensionId not set')
  const urlPart = `chrome-extension://${extensionId}/notification.html`
  let np: any = context.pages().find((p: any) => p.url().includes(urlPart))
  if (!np) np = await context.waitForEvent('page', { predicate: (p: any) => p.url().includes(urlPart), timeout: 15000 })
  await np.waitForLoadState('domcontentloaded').catch(() => {})
  await sleep(1200)
  const run = cdpRunFor(np)
  for (let i = 0; i < clicks; i++) {
    if (np.isClosed()) break
    const clicked = await run(
      `(()=>{for(const t of ${JSON.stringify(CONFIRM_TIDS)}){const b=document.querySelector('[data-testid="'+t+'"]:not([disabled])');if(b){b.click();return t}}` +
      `const byText=[...document.querySelectorAll('button')].find(b=>/^(connect|confirm|approve|next|got it|sign)$/i.test((b.innerText||'').trim()));` +
      `if(byText){byText.click();return 'text:'+byText.innerText.trim()}return null})()`,
    ).catch(() => null)
    if (!clicked && !np.isClosed()) {
      const avail = await run(`[...document.querySelectorAll('button[data-testid]')].map(b=>b.getAttribute('data-testid')).join(', ')`).catch(() => '')
      console.warn(`[driveNotification] no confirm button found (step ${i}); available: ${avail}`)
    }
    await sleep(1500)
  }
}

// Persona → anvil address (matches course-demo.js PERSONAS). Renames don't always
// stick in 13.24.0, but each imported cell's testid carries the address, so we
// switch by address for reliability.
const PERSONA_ADDR: Record<string, string> = {
  'alice (author)': '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', // anvil #1
  'bob (client)':   '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', // anvil #2
  'eve (other)':    '0x90f79bf6eb2c4f870365e785982e1f101e93b906', // anvil #3
}

MetaMask.prototype.switchAccount = async function (accountName: string) {
  const run = cdpRunFor(this.page)
  const query = PERSONA_ADDR[accountName.toLowerCase()] ?? accountName
  await switchAccountCDP({ run }, query)
}

MetaMask.prototype.connectToDapp = async function (_accounts?: string[]) {
  // 13.24.0 connect: a single "Connect" confirmation (account pre-selected).
  await driveNotification(this.context, this.extensionId, 3)
}

MetaMask.prototype.confirmTransaction = async function (_options?: any) {
  await driveNotification(this.context, this.extensionId, 2)
}

MetaMask.prototype.approveNewNetwork = async function () {
  await driveNotification(this.context, this.extensionId, 2)
}

MetaMask.prototype.approveSwitchNetwork = async function () {
  await driveNotification(this.context, this.extensionId, 1)
}

const test = testWithSynpress(metaMaskFixtures(daskiboSetup))
export { test, MetaMask }
export const { expect } = test
