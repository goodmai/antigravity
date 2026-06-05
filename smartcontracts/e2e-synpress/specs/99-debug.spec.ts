import { test, expect } from './synpress'

test('debug: which account connects', async ({ page, metamask }) => {
  await page.goto('/course-demo.html')
  await metamask.switchAccount('Alice (Author)')
  await page.locator('#btn-connect').click()
  await metamask.connectToDapp()
  await page.waitForTimeout(1500)
  const accts = await page.evaluate(() => (window as any).ethereum.request({ method: 'eth_accounts' }))
  const acctText = await page.locator('#acct').textContent()
  const roleText = await page.locator('#role').textContent()
  console.log('DEBUG eth_accounts =', JSON.stringify(accts))
  console.log('DEBUG #acct =', acctText, '| #role =', roleText)
})
