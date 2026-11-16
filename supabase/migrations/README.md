# Migraciones de Supabase

Los archivos están **versionados por timestamp** y el CLI de Supabase lleva el registro de
cuáles ya se aplicaron en `supabase_migrations.schema_migrations`. Ya no hay que acordarse de
correr "los tres SQL en orden" a mano.

| Versión | Archivo | Qué hace |
| --- | --- | --- |
| `20261113000000` | `20261113000000_schema.sql` | Tablas base, RLS por usuario, `delete_my_account()`. |
| `20261115000000` | `20261115000000_hogares.sql` | Hogares, membresías, invitaciones y RLS por hogar. |
| `20261116000000` | `20261116000000_comidas_por_dia.sql` | Columna `slot` y unique por `(día, slot)`. |

Los tres son **idempotentes**: también se pueden correr a mano en el SQL Editor si hace falta.

## Comandos

```bash
npm run db:status     # lista local vs remoto (qué falta aplicar)
npm run db:dry        # muestra qué aplicaría, sin tocar nada
npm run db:push       # aplica SOLO las pendientes, en orden
npm run db:migrations # lista las versiones y el comando de baseline
```

Antes, una sola vez, hay que vincular el proyecto (requiere `npx supabase login`):

```bash
npx supabase link --project-ref <ref>   # el ref está en VITE_SUPABASE_URL
```

## Baseline de la base actual

La base de producción **ya tenía las tres migraciones aplicadas a mano** antes de adoptar el
CLI, así que su tabla de historial está vacía. Para no volver a ejecutarlas, se marcan como
aplicadas:

```bash
npx supabase migration repair 20261113000000 20261115000000 20261116000000 --status applied --remote
```

(`npm run db:migrations` imprime ese comando con las versiones reales del directorio.)

Después `npm run db:status` debe mostrar las tres como aplicadas en ambas columnas.

## Agregar una migración nueva

```bash
npx supabase migration new nombre_del_cambio
# se crea supabase/migrations/<timestamp>_nombre_del_cambio.sql
npm run db:push
```

No edites una migración ya aplicada: creá una nueva. El timestamp es la identidad del cambio.
