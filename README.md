# Comidas 🥬

PWA para organizar **las cenas de la semana** según la dificultad que tengas ganas de cocinar.
Pensada mobile-first, en español, para cocina vegetariana.

## Documentación

- [`docs/DESARROLLO.md`](docs/DESARROLLO.md): cómo correr el proyecto, arquitectura, modelo de
  datos, convenciones y recetas para extenderlo.
- [`docs/ESTADO.md`](docs/ESTADO.md): qué está hecho, decisiones, limitaciones, pendientes y
  bitácora de cambios. **Empezá por acá si retomás el proyecto.**

> Estado actual: la app funciona **con cuenta obligatoria** contra Supabase, con caché de
> lectura y cola de escrituras para seguir usándola sin conexión. Login, escrituras,
> persistencia y RLS están probados de punta a punta; falta el deploy y la prueba de login
> en dos dispositivos.

## Qué hace

- **Semana**: para cada día elegís una dificultad (Del freezer, Muy fácil, Fácil, Media, Elaborada) y la app sugiere platos que encajan. Podés **agregar más de una comida por día** (cada una con su dificultad y su plato) y dejar **una sola nota** por día.
- **Recetario**: platos con dificultad, tiempo, etiquetas, ingredientes, pasos, link y si son aptos para freezer. El nombre del ingrediente se autocompleta para evitar duplicados.
- **Sugerencias**: "Sorpréndeme" completa los días vacíos sin repetir platos y priorizando favoritos.
- **Compras**: arma la lista de la semana agrupada en Verdulería, Supermercado, Dietética y Otros, suma cantidades compatibles (500 g + 1 kg → 1.5 kg), conserva lo tildado y deja agregar, editar o borrar ítems manuales eligiendo el rubro y con autocompletado del ingrediente.
- **Historial**: guarda las semanas planificadas para consultarlas o repetirlas.
- **Temas**: clásico, cool y oscuro, se eligen en Ajustes y se recuerdan en cada dispositivo.
- **Cuenta obligatoria (nube)**: ingreso, registro, recuperación de contraseña y eliminación de cuenta. Sin sesión no se accede a los datos.
- **Hogar compartido**: un link de invitación une a varias personas al mismo tablero; platos, semana, compras e historial son comunes y todos pueden editarlos.
- **Offline (nube)**: con la app ya abierta, sin conexión se usan los últimos datos guardados y los cambios se encolan; al volver la red se sincronizan solos.
- **PWA**: se instala en el celular, funciona sin conexión y se abre como app.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · Supabase · vite-plugin-pwa

## Cuenta y sincronización

La app **siempre funciona con cuenta**: el menú, los platos y las compras viven en Supabase y
se sincronizan entre dispositivos. Si faltan las variables de entorno, la app muestra una
pantalla de “Falta configurar Supabase” en lugar de abrir un modo local.

> El modo local existe solo para los tests de Playwright (`--mode e2e` + `VITE_E2E_LOCAL=1`).
> Una build de producción ignora esa variable, así que ningún usuario puede saltearse el login.

### Configurar Supabase

1. Creá un proyecto gratis en [supabase.com](https://supabase.com).
2. Aplicá las migraciones versionadas con el CLI de Supabase (el CLI lleva el
   registro de cuáles ya se aplicaron):

   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>       # el ref está en la URL del proyecto
   npm run db:push                            # aplica solo las pendientes, en orden
   ```

   También podés correr los tres archivos de [`supabase/migrations/`](supabase/migrations/)
   a mano en el SQL Editor (son idempotentes). Ver
   [`supabase/migrations/README.md`](supabase/migrations/README.md) para el
   *baseline* de una base que ya estaba migrada a mano.
3. En **Project Settings → API**, copiá `Project URL` y `anon public key`.
4. Creá `.env.local` a partir de `.env.example`:

   ```bash
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

5. Reiniciá `npm run dev`. Al entrar, la app pide crear cuenta o ingresar.

> Por defecto Supabase pide confirmar el email. Si querés saltarte ese paso mientras probás,
> desactivalo en **Authentication → Sign In / Providers → Email → Confirm email**.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests de lógica (Vitest)
npm run test:e2e # tests de interfaz (Playwright + Chrome)
npm run build    # genera dist/
npm run preview  # sirve el build
npm run icons    # regenera los íconos PWA (requiere sharp)
```

## Deploy

Es un sitio estático. Cualquier hosting sirve (Vercel, Netlify, Cloudflare Pages, GitHub Pages):

- Build: `npm run build`
- Publish dir: `dist`

La app usa `HashRouter`, así que no hacen falta reglas de rewrite. Para instalar la PWA hace falta HTTPS.
En Vercel, importá el repo, dejá el build `npm run build` y el output `dist`, y cargá
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como variables de entorno del proyecto
(**Production** y **Preview**). Sin ellas, la URL pública muestra la pantalla de configuración.

Producción: **<https://comidas-pi.vercel.app>** (proyecto `comidas` de Vercel, conectado a
`moloyo/FoodOrganizer`). Es la URL canónica: Site URL y Redirect URLs de Supabase ya están
configuradas; si cambiás de dominio, actualizalas en Authentication → URL Configuration.

## Modelo de datos

| Tabla | Para qué |
| --- | --- |
| `households` | Un hogar compartido (nombre y dueño). |
| `household_members` | Relación usuario ↔ hogar (`owner` / `member`). |
| `household_invites` | Links de invitación con vencimiento, revocación y contador de usos. |
| `dishes` | Recetario del hogar: dificultad, minutos, tags, ingredientes (`jsonb`), pasos, freezer. |
| `plans` | Una fila por comida, día y semana: `week_start` (lunes), `day` 0–6, `slot` (posición de la comida en el día), `mode`, `dish_id` y `note`. La nota solo se guarda en `slot = 0`. |
| `shopping_items` | Lista de compras por semana, con tildado y rubro. |

Las tres tablas de datos tienen `household_id` y RLS por membresía: solo se ven las filas del
hogar al que pertenece la sesión (`is_household_member(household_id)`). Las escrituras de
membresías e invitaciones pasan por funciones `security definer` (`my_household()`,
`household_join()`, `household_invite_create()`, etc.). El `user_id` que queda en las tablas de
datos es solo metadata de autoría, sin FK.

## Hogares

En **Ajustes → Hogar** se ve el nombre, los miembros y los links de invitación activos.
“Crear link de invitación” genera una URL `#/unirse/<token>` válida 7 días y revocable; quien la
abre inicia sesión (o crea una cuenta) y confirma que quiere unirse. Al unirse, sus datos se
mueven al hogar compartido y su hogar anterior vacío se elimina. “Salir del hogar” está en **Zona peligrosa**: deja los datos compartidos donde están y crea un
hogar nuevo vacío **cuando queda otro miembro**; si sos el único, la opción directamente **no se
muestra** (el hogar vacío se borraría con todos sus datos).
Si el último miembro **borra su cuenta**, el hogar y sus datos sí se eliminan.

## Varias comidas por día

Cada día puede tener **1..N comidas**, todas iguales: dificultad, un plato y sus botones. El
botón **"+" Agregar otra comida** suma una sección vacía y la ✕ la quita (solo cuando hay 2 o
más). **La nota es una sola por día**, abajo de todas las secciones. No hay nombres de comidas:
el recetario es el mismo para todas.

El default es **una comida por día**, así que la app se ve igual que siempre hasta que agregás
otra. "Sorpréndeme" llena todas las comidas vacías sin repetir platos en la semana, y la lista
de compras suma los ingredientes de todas.

## Sincronización en tiempo real

Los miembros de un hogar se avisan los cambios por **Supabase Realtime** (broadcast por hogar).
Cuando alguien guarda algo, los demás —y sus otras pestañas— **releen del servidor** sin tener
que recargar. La señal no lleva datos: cada cliente consulta con su propia sesión, así que el
RLS sigue mandando. Si hay cambios pendientes en la cola offline, el refresco se posterga para
no pisarlos. No requiere ninguna configuración extra en Supabase.

## Migraciones versionadas

Los SQL viven en [`supabase/migrations/`](supabase/migrations/) con timestamp y el CLI registra
cuáles ya se aplicaron en `supabase_migrations.schema_migrations`:

```bash
npm run db:status   # qué falta
npm run db:dry      # vista previa
npm run db:push     # aplica solo las pendientes
```

## Ideas para seguir

- Fotos de los platos y recetas completas.
- Tema automático según la preferencia del sistema.
- Cantidad de comensales y escalado de ingredientes.
- "Ya lo cociné" para mejorar las sugerencias con el historial.
- Recordatorio semanal para planificar el domingo.
- Sincronización en tiempo real entre miembros del hogar (hoy se ve al recargar).
