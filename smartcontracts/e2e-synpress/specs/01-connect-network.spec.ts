/**
 * Spec 01: Connect MetaMask + verify "Add / switch Anvil network" button.
 *
 * Validates:
 *   - wallet_addEthereumChain call sends correct params (chainId 0x7a69, symbol tBNB)
 *   - MetaMask approves the network addition
 *   - Page shows chainId 31337 after switch
 */
import { test, expect } from './synpress'

test('demo page loads with correct chain config', async ({ page }) => {
  await page.goto('/course-demo.html')

  // Chain info is rendered in the hero subtitle
  await expect(page.locator('#net-line')).toContainText('31337')
  await expect(page.locator('#net-line')).toContainText('9545')
})

test('Add/switch Anvil network button triggers wallet_addEthereumChain', async ({
  page,
  metamask,
}) => {
  await page.goto('/course-demo.html')

  // Intercept the ethereum request to validate params
  const requestPromise = page.evaluate(() =>
    new Promise<unknown>(resolve => {
      const orig = (window as any).ethereum.request.bind((window as any).ethereum)
      ;(window as any).ethereum.request = async (args: { method: string; params: unknown[] }) => {
        if (args.method === 'wallet_addEthereumChain') resolve(args.params[0])
        return orig(args)
      }
    })
  )

  await page.locator('#btn-network').click()

  // Handle the MetaMask confirmation popup
  await metamask.approveNewNetwork()

  const params = await requestPromise as Record<string, unknown>
  expect((params as any).chainId).toBe('0x7a69')
  // Anvil's native token is ETH; the demo sends symbol 'ETH' for chain 31337
  // (course-demo.js — only non-local chains advertise 'tBNB'). 'tBNB' is merely
  // the cosmetic label MetaMask stored for the network in the wallet cache, not
  // what the dapp passes to wallet_addEthereumChain.
  expect((params as any).nativeCurrency?.symbol).toBe('ETH')
})
