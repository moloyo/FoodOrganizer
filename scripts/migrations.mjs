import { readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS_DIR = resolve(here, '..', 'supabase', 'migrations')

/** Solo los archivos con timestamp de 14 dígitos son migraciones. */
export function listMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort()
    .map((name) => ({ version: name.slice(0, 14), file: name }))
}

/** Valida nombres, unicidad y orden. La usa el test y `--check`. */
export function validateMigrations(migrations) {
  const versions = migrations.map((item) => item.version)
  const duplicates = [...new Set(versions.filter((v, i) => versions.indexOf(v) !== i))]
  const sorted = versions.every((v, i) => i === 0 || versions[i - 1] <= v)
  return {
    ok: duplicates.length === 0 && sorted && migrations.length > 0,
    duplicates,
    sorted,
    count: migrations.length,
  }
}

/**
 * Producción ya tenía las 3 migraciones aplicadas a mano, antes de adoptar el
 * CLI. Este comando las marca como aplicadas SIN volver a ejecutarlas.
 */
export function baselineCommand(migrations) {
  const versions = migrations.map((item) => item.version).join(' ')
  return `supabase migration repair ${versions} --status applied --remote`
}

function main() {
  const migrations = listMigrations()
  const check = validateMigrations(migrations)
  console.log('Migraciones locales (en orden):')
  for (const item of migrations) console.log(`  ${item.version}  ${item.file}`)

  if (!check.ok) {
    console.error(`\nError: ${check.duplicates.length ? 'timestamps duplicados' : 'orden inválido'}`)
    process.exitCode = 1
    return
  }

  console.log('\nPara un proyecto NUEVO:')
  console.log('  npm run db:push          # aplica solo las pendientes')
  console.log('\nPara la base ACTUAL (ya migrada a mano, baseline):')
  console.log(`  npx ${baselineCommand(migrations)}`)
  console.log('  npm run db:status        # verifica que figuren aplicadas')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
