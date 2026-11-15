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
  await expect(page.getByText('Pan rallado')).toBeVisible()

  page.on('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Quitar Pan rallado' }).click()
  await expect(page.getByText('Pan rallado')).toBeHidden()
})
