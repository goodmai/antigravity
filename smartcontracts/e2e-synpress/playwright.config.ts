import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,  // MetaMask state is shared — run sequentially
  retries: 1,
  workers: 1,

  use: {
    baseURL: 'http://localhost:8085',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        executablePath: '/usr/bin/google-chrome',
        channel: 'chrome'
      },
    },
  ],

  // Frontend must be running (docker compose --profile local-full up -d)
  webServer: {
    command: 'curl -sf http://localhost:8085/course-demo.html > /dev/null && echo ok',
    url: 'http://localhost:8085/course-demo.html',
    reuseExistingServer: true,
    timeout: 5000,
  },
})
