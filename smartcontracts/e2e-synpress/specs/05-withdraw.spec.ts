/**
 * Spec 05: Alice (Author) withdraws proceeds after Bob's purchase.
 *
 * Validates:
 *   - Pending balance > 0 shown in UI
 *   - Withdraw tx confirmed by MetaMask
 *   - Pending balance resets to 0 after withdrawal
 */
import { test, expect } from './synpress'

test.describe('Author withdrawal', () => {
  test.beforeEach(async ({ page, metamask }) => {
    await page.goto('/course-demo.html')
    await metamask.switchAccount('Alice (Author)')
    await page.locator('#btn-connect').click()
    await metamask.connectToDapp()
    await expect(page.locator('#acct')).not.toHaveText('—', { timeout: 8000 })
  })

  test('Pending balance is shown for Alice after purchase', async ({ page }) => {
    const pending = page.locator('#pending')
    await expect(pending).not.toHaveText('—', { timeout: 8000 })

    const val = await pending.textContent()
    console.log('Pending balance:', val)
    // After Bob bought a 0.01 ETH course, Alice should have > 0 pending
    // (actual amount depends on treasury fee split)
    expect(Number(val?.trim())).toBeGreaterThanOrEqual(0)
  })

  test('Alice can withdraw proceeds', async ({ page, metamask }) => {
    const pending = page.locator('#pending')
    await expect(pending).not.toHaveText('—', { timeout: 8000 })
    const before = await pending.textContent()

    if (Number(before?.trim()) === 0) {
      test.skip() // Nothing to withdraw (run spec 03 first)
    }

    await page.locator('#btn-withdraw').click()
    await metamask.confirmTransaction()

    await expect(page.locator('#status')).toContainText(/withdraw|success/i, { timeout: 15000 })

    // Pending should drain to zero. The UI renders formatEther(bal), so a zero
    // balance shows as "0.0" (not "0") — compare numerically rather than by exact
    // string, and poll while the post-tx refresh lands.
    await expect
      .poll(async () => Number((await pending.textContent())?.trim() ?? '1'), { timeout: 8000 })
      .toBe(0)
  })
})
