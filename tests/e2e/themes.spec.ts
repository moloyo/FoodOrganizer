import { expect, test } from '@playwright/test'

test('el tema se elige en Ajustes y sobrevive a la recarga', async ({ page }) => {
  await page.goto('/#/ajustes')
  const html = page.locator('html')

  await page.getByRole('button', { name: /Oscuro/ }).click()
  await expect(html).toHaveAttribute('data-theme', 'oscuro')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0F1512')

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'oscuro')

  await page.getByRole('button', { name: /Clásico/ }).click()
  expect(await html.getAttribute('data-theme')).toBeNull()
})
