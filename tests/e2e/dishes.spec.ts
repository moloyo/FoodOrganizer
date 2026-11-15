import { expect, test } from '@playwright/test'

test('se crea un plato con ingrediente autocompletado y persiste', async ({ page }) => {
  await page.goto('/#/platos')
  await expect(page.getByText('20 platos')).toBeVisible()

  await page.getByRole('button', { name: 'Nuevo' }).click()
  const dialog = page.getByRole('dialog')

  await dialog.getByPlaceholder('Ej. Tarta de zapallito y queso').fill('Tarta E2E')
  await dialog.getByRole('button', { name: 'Fácil', exact: true }).click()

  const ingredient = dialog.getByPlaceholder('Ingrediente')
  await ingredient.fill('eso')
  const queso = dialog.getByRole('option', { name: /^Queso\b/ }).first()
  await expect(queso).toBeVisible()
  await queso.click()
  await expect(ingredient).toHaveValue(/^Queso/)

  await dialog.getByPlaceholder('Cant.').fill('2')
  await dialog.getByPlaceholder('Unidad').fill('u')
  await dialog.getByRole('button', { name: 'Agregar al recetario' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByText('21 platos')).toBeVisible()
  await expect(page.getByText('Tarta E2E')).toBeVisible()

  await page.reload()
  await expect(page.getByText('21 platos')).toBeVisible()
  await expect(page.getByText('Tarta E2E')).toBeVisible()
})
