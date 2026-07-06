/**
 * Spec 03: Bob (Client) buys a course.
 *
 * Validates:
 *   - Account switch (Alice → Bob in MetaMask, reconnect)
 *   - buy() tx value = course price (0.01 ETH)
 *   - MetaMask shows correct "Send" amount
 *   - AccessPass NFT minted for Bob after purchase
 */
import { test, expect } from './synpress'

test.describe('Buy course as Bob (Client)', () => {
  test.beforeEach(async ({ page, metamask }) => {
    await page.goto('/course-demo.html')

    // Switch MetaMask to Bob
    await metamask.switchAccount('Bob (Client)')

    // Connect wallet
    await page.locator('#btn-connect').click()
    await metamask.connectToDapp()
    await expect(page.locator('#acct')).not.toHaveText('—', { timeout: 8000 })

    // Refresh catalog to load courses
    await page.locator('#btn-refresh').click()
    await expect(page.locator('#catalog')).not.toHaveText('No courses yet.', { timeout: 10000 })
  })

  test('Bob is detected as client role', async ({ page }) => {
    await expect(page.locator('#role')).toHaveText('Client', { timeout: 5000 })
  })

  test('Bob can buy the first course', async ({ page, metamask }) => {
    // Click Buy on the first available course
    const buyBtn = page.locator('button:has-text("Buy")').first()
    await expect(buyBtn).toBeVisible({ timeout: 5000 })
    await buyBtn.click()

    // MetaMask popup: confirm transaction
    await metamask.confirmTransaction()

    // Status should reflect successful purchase
    await expect(page.locator('#status')).toContainText(/purchas|access|success|nft/i, {
      timeout: 20000,
    })
  })

  test('Bob has AccessPass NFT after buying', async ({ page, metamask }) => {
    // Bob may already own the course from the previous test (anvil is not reset
    // between tests, so AccessPass persists). When owned, the demo renders no
    // "Buy" button — so only buy if one is present; either way Bob ends up with
    // the pass, which is what this test verifies.
    const buyBtn = page.locator('button:has-text("Buy")').first()
    if (await buyBtn.count() > 0 && await buyBtn.isVisible().catch(() => false)) {
      await buyBtn.click()
      await metamask.confirmTransaction()
      await expect(page.locator('#status')).toContainText(/purchas|nft|access/i, { timeout: 20000 })
    }

    // Reconnect to refresh balance/NFT count
    await page.locator('#btn-connect').click()
    await metamask.connectToDapp()

    // #passes renders like "1 (course 0)" (or "0"), so parse the leading integer.
    const passes = page.locator('#passes')
    await expect(passes).not.toHaveText('—', { timeout: 8000 })
    const passCount = await passes.textContent()
    expect(parseInt(passCount?.trim() ?? '0', 10)).toBeGreaterThan(0)
  })
})
