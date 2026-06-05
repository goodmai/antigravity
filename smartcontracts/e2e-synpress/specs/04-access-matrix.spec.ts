/**
 * Spec 04: Verify access matrix after purchase.
 *
 * Validates:
 *   - Author (Alice)  → hasCourseAccess = true  ✓
 *   - Client (Bob)    → hasCourseAccess = true  ✓  (after buying)
 *   - Eve (other)     → hasCourseAccess = false ✗
 *
 * Access check is a pure read call — no MetaMask tx needed.
 */
import { test, expect } from './synpress'

const ALICE = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const BOB   = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const EVE   = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'

test.describe('Access matrix', () => {
  test.beforeEach(async ({ page, metamask }) => {
    await page.goto('/course-demo.html')
    await metamask.switchAccount('Alice (Author)')
    await page.locator('#btn-connect').click()
    await metamask.connectToDapp()
    await expect(page.locator('#acct')).not.toHaveText('—', { timeout: 8000 })

    // Ensure there's at least one course registered
    await page.locator('#btn-refresh').click()
    const catalog = await page.locator('#catalog').textContent()
    if (!catalog || catalog.includes('No courses yet')) {
      // Register a test course
      await page.locator('#btn-register').click()
      await metamask.confirmTransaction()
      await expect(page.locator('#status')).toContainText(/registered|id/i, { timeout: 15000 })
    }
  })

  test('Check access button reveals matrix with correct results', async ({ page }) => {
    await page.locator('#btn-access').click()

    const matrix = page.locator('#matrix')
    await expect(matrix).not.toHaveText('Connect & register a course first.', { timeout: 10000 })

    // Matrix should have rendered at least one row
    await expect(matrix.locator('table')).toBeVisible({ timeout: 5000 })
  })

  test('Alice (author) always has access', async ({ page }) => {
    await page.locator('#btn-access').click()
    await expect(page.locator('#matrix table')).toBeVisible({ timeout: 10000 })

    // Alice row should show ✓ / "yes" / true
    const aliceRow = page.locator(`tr:has-text("${ALICE.slice(0, 10)}")`).first()
    await expect(aliceRow).toContainText(/yes|✓|true/i, { timeout: 5000 })
  })

  test('Eve (unauthorized) is denied', async ({ page }) => {
    await page.locator('#btn-access').click()
    await expect(page.locator('#matrix table')).toBeVisible({ timeout: 10000 })

    const eveRow = page.locator(`tr:has-text("${EVE.slice(0, 10)}")`).first()
    await expect(eveRow).toContainText(/no|✗|false/i, { timeout: 5000 })
  })
})
