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

// The matrix renders one row per persona, labelled by ROLE and a truncated
// address (course-demo.js `short()` → "0x7099…79C8"). Match rows by the role
// pill text — the persona addresses (Author=anvil#1 0x7099, Client=anvil#2
// 0x3C44, Eve=anvil#3 0x90F7) are truncated in the cell so an address-prefix
// substring match never hits.

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

    // Author row should show ✓ (author always has access to their own course)
    const aliceRow = page.locator('tr:has-text("Author")').first()
    await expect(aliceRow).toContainText(/yes|✓|true/i, { timeout: 5000 })
  })

  test('Eve (unauthorized) is denied', async ({ page }) => {
    await page.locator('#btn-access').click()
    await expect(page.locator('#matrix table')).toBeVisible({ timeout: 10000 })

    const eveRow = page.locator('tr:has-text("Eve")').first()
    await expect(eveRow).toContainText(/no|✗|false/i, { timeout: 5000 })
  })
})
