/**
 * Custom Playwright fixture for Daskibo MetaMask e2e tests.
 *
 * Connects to a RUNNING Chrome instance (started by start-chrome-dev.sh).
 * MetaMask (ID: hebhblbkkdabgoldnojllkipeoacjioc) is pre-configured in the
 * .chrome-user-data profile with Alice, Bob, Eve accounts + Daskibo Anvil network.
 *
 * Chrome must be started first:
 *   bash smartcontracts/start-chrome-dev.sh
 *
 * This avoids the Synpress CLI cache issue (Playwright bundled Chromium not
 * available on Ubuntu 26.04).
 */
import { test as base, BrowserContext, Page, chromium } from '@playwright/test'
import { MetaMask } from '@synthetixio/synpress/playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const CDP_URL      = 'http://localhost:9222'
const MM_EXT_ID    = process.env.METAMASK_EXT_ID   ?? 'hebhblbkkdabgoldnojllkipeoacjioc'
const MM_PASSWORD  = process.env.METAMASK_PASSWORD ?? '1234567890'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Singleton context — connect once, reuse for all tests in a worker
let _ctx: BrowserContext | null = null
let _mmPage: Page | null = null

async function getContext(): Promise<BrowserContext> {
  if (_ctx) return _ctx

  // Connect to the already-running Chrome
  const browser = await chromium.connectOverCDP(CDP_URL)
  _ctx = browser.contexts()[0]
  if (!_ctx) throw new Error(`No browser context at ${CDP_URL}. Run start-chrome-dev.sh first.`)
  return _ctx
}

async function getMMPage(context: BrowserContext): Promise<Page> {
  if (_mmPage && !_mmPage.isClosed()) return _mmPage

  // Look for existing MetaMask home page
  _mmPage = context.pages().find(p =>
    p.url().includes(MM_EXT_ID + '/home.html')
  ) ?? null

  if (!_mmPage) {
    // Open via service worker (reliable for system Chrome)
    const sw = context.serviceWorkers().find(sw => sw.url().includes(MM_EXT_ID))
    if (!sw) throw new Error('MetaMask service worker not found')

    const pagePromise = context.waitForEvent('page', { timeout: 8000 })
    await sw.evaluate(() => {
      ;(chrome.tabs as any).create({ url: chrome.runtime.getURL('home.html') })
    })
    _mmPage = await pagePromise
    await _mmPage.waitForLoadState('domcontentloaded').catch(() => {})
    await sleep(500)
  }

  return _mmPage
}

type DaskiboFixtures = {
  context:      BrowserContext
  page:         Page
  metamaskPage: Page
  metamask:     MetaMask
  extensionId:  string
}

export const test = base.extend<DaskiboFixtures>({
  context: [async ({}, use) => {
    const ctx = await getContext()
    await use(ctx)
  }, { scope: 'test' }],

  page: [async ({ context }, use) => {
    // Each test gets a fresh demo page
    const p = await context.newPage()
    await use(p)
    await p.close().catch(() => {})
  }, { scope: 'test' }],

  metamaskPage: [async ({ context }, use) => {
    const page = await getMMPage(context)
    await use(page)
  }, { scope: 'test' }],

  extensionId: [async ({}, use) => {
    await use(MM_EXT_ID)
  }, { scope: 'test' }],

  metamask: [async ({ context, metamaskPage, extensionId }, use) => {
    const mm = new MetaMask(context, metamaskPage, MM_PASSWORD, extensionId)
    await use(mm)
  }, { scope: 'test' }],
})

export const { expect } = test
