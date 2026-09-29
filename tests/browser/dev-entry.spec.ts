import { expect, test } from '@playwright/test'

test('dev server root opens the example', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL('http://127.0.0.1:5197/example/')
  await expect(page.locator('#editor .ql-editor')).toBeVisible()
})
