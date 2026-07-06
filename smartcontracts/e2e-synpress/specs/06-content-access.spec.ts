/**
 * Spec 06 (@content): DRM content-unlock — the FULL Bob journey.
 *
 *   1. BEFORE buying, Bob opens the gated reader → access denied, lesson stays
 *      locked (encrypted/blurred). Proves "no access ⇒ cannot read".
 *   2. Bob buys course #1.
 *   3. AFTER buying, Bob opens the reader → Chipotle releases the key (the on-chain
 *      hasCourseAccess(Bob,1) is now true), the lesson decrypts and the plaintext
 *      is shown. Proves "access ⇒ decrypts and sees the text".
 *
 * Runs in ISOLATION on a freshly-seeded stack (see seed-content.sh): course #1
 * "Intro to Greenfield" registered by the Author + demo/manifest-1.json keyed to
 * the live chipotle-mock PKP. NOT part of the default suite — tagged @content so
 * the main run (`--grep-invert @content`) skips it; this phase runs `--grep @content`
 * after seeding, otherwise Bob would already own #1 from spec 03.
 */
import { test, expect } from './synpress'

const READER = '/course-content.html?id=1'
const DEMO = '/course-demo.html'

test.describe('@content Course content access (Bob: no access → buy → unlock → read)', () => {
  test('@content Bob is denied before buying — lesson stays locked', async ({ page, metamask }) => {
    await metamask.switchAccount('Bob (Client)')

    await page.goto(READER)
    await expect(page.locator('#status')).toContainText(/connect metamask/i, { timeout: 10000 })

    await page.locator('#btn-unlock').click()
    // eth_requestAccounts: a connect popup if Bob isn't permitted yet (tolerant).
    await metamask.connectToDapp()

    // hasCourseAccess(Bob,1) == false → reader refuses; no signature is requested.
    await expect(page.locator('#status')).toContainText(/access denied|does not own/i, { timeout: 15000 })
    await expect(page.locator('#lesson')).toHaveClass(/locked/)
  })

  test('@content Bob buys course #1', async ({ page, metamask }) => {
    await page.goto(DEMO)
    await metamask.switchAccount('Bob (Client)')
    await page.locator('#btn-connect').click()
    await metamask.connectToDapp()
    await expect(page.locator('#acct')).not.toHaveText('—', { timeout: 8000 })

    await page.locator('#btn-refresh').click()
    await expect(page.locator('#catalog')).not.toHaveText('No courses yet.', { timeout: 10000 })

    await page.locator('button:has-text("Buy")').first().click()
    await metamask.confirmTransaction()
    await expect(page.locator('#status')).toContainText(/purchas|access|success|nft/i, { timeout: 20000 })
  })

  test('@content Bob unlocks and reads the decrypted lesson after buying', async ({ page, metamask }) => {
    await metamask.switchAccount('Bob (Client)')

    await page.goto(READER)
    await expect(page.locator('#status')).toContainText(/connect metamask/i, { timeout: 10000 })

    await page.locator('#btn-unlock').click()
    await metamask.connectToDapp()      // connect popup (tolerant if already permitted)
    await metamask.confirmTransaction() // personal_sign proof popup

    // Key released → lesson decrypted and rendered (the stub body says "decrypted").
    await expect(page.locator('#status')).toContainText(/unlocked/i, { timeout: 25000 })
    await expect(page.locator('#lesson')).not.toHaveClass(/locked/, { timeout: 5000 })
    await expect(page.locator('#lesson')).toContainText(/decrypted/i, { timeout: 5000 })
  })
})
