/**
 * Spec 02: Alice (Author) connects wallet and registers a course.
 *
 * Validates:
 *   - Connect flow (wallet_requestPermissions)
 *   - Role detection: "author"
 *   - registerCourse tx is confirmed by MetaMask
 *   - Catalog shows the new course after registration
 */
import { test, expect } from './synpress'

test.describe('Register course as Alice (Author)', () => {
  test.beforeEach(async ({ page, metamask }) => {
    await page.goto('/course-demo.html')

    // Ensure Alice is selected in MetaMask
    await metamask.switchAccount('Alice (Author)')

    // Connect wallet to demo page
    await page.locator('#btn-connect').click()
    await metamask.connectToDapp()

    // Wait for account to appear
    await expect(page.locator('#acct')).not.toHaveText('—', { timeout: 8000 })
  })

  test('Alice is detected as author role', async ({ page }) => {
    const role = page.locator('#role')
    await expect(role).toHaveText('Author', { timeout: 5000 })
  })

  test('Alice can register a course', async ({ page, metamask }) => {
    // Fill course details
    await page.locator('#c-title').fill('Test Course via Synpress')
    await page.locator('#c-price').fill('0.01')
    await page.locator('#c-duration').selectOption('0') // Perpetual

    // Submit registration
    await page.locator('#btn-register').click()

    // MetaMask popup: confirm transaction
    await metamask.confirmTransaction()

    // Wait for status to reflect success
    await expect(page.locator('#status')).toContainText(/registered|course|id/i, { timeout: 15000 })

    // Catalog should now show the course
    await page.locator('#btn-refresh').click()
    await expect(page.locator('#catalog')).not.toHaveText('No courses yet.', { timeout: 10000 })
    await expect(page.locator('#catalog')).toContainText('0.01')
  })
})
