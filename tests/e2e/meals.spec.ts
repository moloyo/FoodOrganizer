import { expect, test } from '@playwright/test'

test('un día puede tener dos comidas y una sola nota', async ({ page }) => {
  await page.goto('/')
  const lunes = page.getByRole('region', { name: /^Lun \d+$/ })

  await expect(page.getByText('0 de 7 cenas')).toBeVisible()
  await lunes.getByRole('button', { name: 'Agregar otra comida' }).click()

  // El contador cambia de wording solo cuando algún día tiene más de una comida.
  await expect(page.getByText('0 de 8 comidas')).toBeVisible()
  await expect(
    lunes.getByRole('group', { name: 'Dificultad del día' }),
  ).toHaveCount(2)
  await expect(lunes.getByRole('button', { name: 'Agregar nota del día' })).toHaveCount(1)
  await expect(lunes.getByRole('button', { name: 'Quitar comida' })).toHaveCount(2)

  // La nota es una sola y sobrevive a agregar/quitar comidas.
  await lunes.getByRole('button', { name: 'Agregar nota del día' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder(/sobró arroz/).fill('Nota única')
  await dialog.getByRole('button', { name: 'Guardar nota' }).click()
  await expect(lunes.getByText('Nota única')).toHaveCount(1)

  await page.reload()
  await expect(page.getByText('0 de 8 comidas')).toBeVisible()
  await expect(page.getByRole('region', { name: /^Lun \d+$/ }).getByText('Nota única')).toHaveCount(1)

  // Quitar la segunda comida vuelve al estado de 1 comida por día.
  await page.getByRole('region', { name: /^Lun \d+$/ })
    .getByRole('button', { name: 'Quitar comida' })
    .last()
    .click()
  await expect(page.getByText('0 de 7 cenas')).toBeVisible()
  await expect(
    page.getByRole('region', { name: /^Lun \d+$/ }).getByRole('group', { name: 'Dificultad del día' }),
  ).toHaveCount(1)
  await expect(
    page.getByRole('region', { name: /^Lun \d+$/ }).getByRole('button', { name: 'Quitar comida' }),
  ).toHaveCount(0)
  await expect(page.getByRole('region', { name: /^Lun \d+$/ }).getByText('Nota única')).toHaveCount(1)
})

test('Sorpréndeme llena todas las comidas vacías', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('region', { name: /^Mar \d+$/ })
    .getByRole('button', { name: 'Agregar otra comida' })
    .click()

  await expect(page.getByText('0 de 8 comidas')).toBeVisible()
  await page
    .locator('.card')
    .filter({ hasText: 'de 8 comidas' })
    .getByRole('button', { name: 'Sorpréndeme' })
    .click()

  await expect(page.getByText('8 de 8 comidas')).toBeVisible()
  await expect(page.getByText('Semana completa. ¡A cocinar!')).toBeVisible()
})
