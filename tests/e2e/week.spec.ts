import { expect, test } from '@playwright/test'

const summaryCard = (page: import('@playwright/test').Page) =>
  page.locator('.card').filter({ hasText: 'de 7 cenas' })

test('Sorpréndeme completa la semana y persiste al recargar', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'La semana' })).toBeVisible()
  await expect(page.getByText('0 de 7 cenas')).toBeVisible()

  await summaryCard(page).getByRole('button', { name: 'Sorpréndeme' }).click()

  await expect(page.getByText('7 de 7 cenas')).toBeVisible()
  await expect(page.getByText('Semana completa. ¡A cocinar!')).toBeVisible()

  await page.reload()
  await expect(page.getByText('7 de 7 cenas')).toBeVisible()
})

test('se elige un plato para un día según su dificultad', async ({ page }) => {
  await page.goto('/')
  const monday = page.getByRole('region', { name: /^Lun \d+$/ })

  await monday.getByRole('button', { name: 'Fácil', exact: true }).click()
  await monday.getByRole('button', { name: 'Elegir plato', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Buscar por nombre, ingrediente o etiqueta').fill('Tarta de zapallito')
  await dialog.getByRole('button', { name: /^Tarta de zapallito/ }).click()

  await expect(monday.getByText('Tarta de zapallito y queso')).toBeVisible()
  await expect(page.getByText('1 de 7 cenas')).toBeVisible()
  await expect(monday).not.toHaveAttribute('aria-label', '')
})
