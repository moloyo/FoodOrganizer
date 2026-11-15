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

  await expect(page.getByRole('heading', { name: /Verdulería/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Supermercado/i })).toBeVisible()
  // La semana se arma al azar: puede no haber ítems de Dietética u Otros.
  // Lo que sí exigimos es que ningún encabezado salga de los cuatro rubros válidos.
  const categorías = await page.getByRole('heading', { level: 2 }).allInnerTexts()
  expect(categorías.length).toBeGreaterThan(0)
  const permitidas = ['verdulería', 'supermercado', 'dietética', 'otros']
  for (const categoría of categorías) {
    // El CSS muestra los encabezados en mayúsculas; innerText las refleja.
    expect(permitidas).toContain(categoría.trim().toLocaleLowerCase('es-AR'))
  }
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

test('el ítem manual autocompleta el ingrediente y respeta el rubro elegido', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Compras' }).click()

  const input = page.getByPlaceholder('Agregar ítem (ej. pan rallado)')
  await input.fill('eso')
  await page.getByRole('option', { name: /^Queso\b/ }).first().click()
  await expect(input).toHaveValue(/^Queso/)
  const elegido = await input.inputValue()

  await page.getByRole('combobox', { name: 'Rubro' }).selectOption('Dietética')
  await page.getByRole('button', { name: 'Agregar ítem' }).click()

  const item = page.getByRole('button', { name: `Marcar ${elegido}`, exact: true })
  await expect(item).toBeVisible()
  const section = page.locator('section').filter({ has: item })
  await expect(section.getByRole('heading', { name: /Dietética/i })).toBeVisible()
})
