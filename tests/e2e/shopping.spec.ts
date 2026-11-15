import { expect, test } from '@playwright/test'

test('la lista de compras agrupa, tilda y acepta ítems manuales', async ({ page }) => {
  await page.goto('/')
  await page
    .locator('.card')
    .filter({ hasText: 'de 7 cenas' })
    .getByRole('button', { name: 'Sorpréndeme' })
    .click()
  await expect(page.getByText('7 de 7 cenas')).toBeVisible()

  await page.getByRole('link', { name: 'Compras' }).click()
  await page.getByRole('button', { name: 'Armar lista' }).click()

  await expect(page.getByText(/^Verdulería$/)).toBeVisible()
  await expect(page.getByText(/^Supermercado$/)).toBeVisible()
  await expect(page.getByText(/^Dietética$/)).toBeVisible()
  await expect(page.getByText(/\d+ pendientes/)).toBeVisible()

  await page.getByRole('button', { name: /^Marcar / }).first().click()
  await expect(page.getByText(/1 de \d+ comprados/)).toBeVisible()

  await page.getByPlaceholder('Agregar ítem (ej. pan rallado)').fill('Pan rallado')
  await page.getByRole('button', { name: 'Agregar ítem' }).click()

  // El ítem generado es "Pan rallado · 200 g", así que el manual se ubica
  // por su nombre exacto para no caer en el modo estricto de Playwright.
  const manualItem = page.getByRole('button', { name: 'Marcar Pan rallado', exact: true })
  await expect(manualItem).toBeVisible()

  page.on('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Quitar Pan rallado', exact: true }).click()
  await expect(manualItem).toBeHidden()
})
