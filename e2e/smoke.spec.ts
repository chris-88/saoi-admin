import { expect, test, type Page } from '@playwright/test'

/**
 * The console mounts behind a real sign-in, and its old `/admin` paths still land on it.
 *
 * Runs against the local dev server by default, or against a deployment:
 *   E2E_BASE_URL=https://admin.saoi.ie npm run e2e
 */

function scriptErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    // A refused request logs a browser network error. That is the server doing its job.
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      errors.push(`console: ${message.text()}`)
    }
  })
  return errors
}

test('beats 17 and 18: the console is behind a sign-in (§37, §47)', async ({ page }) => {
  const errors = scriptErrors(page)
  await page.goto('/#/')
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  await expect(page.getByLabel(/email/i)).toBeVisible()
  expect(errors).toEqual([])
})

test('an old /admin path lands on the same screen without the prefix', async ({ page }) => {
  await page.goto('/#/admin/guardrails')
  await expect(page).toHaveURL(/#\/guardrails$/)
})
