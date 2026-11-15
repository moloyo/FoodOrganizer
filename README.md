# Comidas 🥬

PWA para organizar **las cenas de la semana** según la dificultad que tengas ganas de cocinar.
Pensada mobile-first, en español, para cocina vegetariana.

## Documentación

- [`docs/DESARROLLO.md`](docs/DESARROLLO.md): cómo correr el proyecto, arquitectura, modelo de
  datos, convenciones y recetas para extenderlo.
- [`docs/ESTADO.md`](docs/ESTADO.md): qué está hecho, decisiones, limitaciones, pendientes y
  bitácora de cambios. **Empezá por acá si retomás el proyecto.**

> Estado actual: funcional en modo local y probado de punta a punta contra Supabase (login,
> escrituras, persistencia y RLS). La lógica está cubierta con tests (Vitest); falta el deploy
> y la prueba con una segunda cuenta.

## Qué hace

- **Semana**: para cada día elegís una dificultad (Del freezer, Muy fácil, Fácil, Media, Elaborada) y la app sugiere platos que encajan. Podés dejar una nota por día ("sobró arroz, usarlo el jueves").
- **Recetario**: platos con dificultad, tiempo, etiquetas, ingredientes, pasos, link y si son aptos para freezer. El nombre del ingrediente se autocompleta para evitar duplicados.
- **Sugerencias**: "Sorpréndeme" completa los días vacíos sin repetir platos y priorizando favoritos.
- **Compras**: arma la lista de la semana agrupada en Verdulería, Supermercado, Dietética y Otros, suma cantidades compatibles (500 g + 1 kg → 1.5 kg), conserva lo tildado y deja editar o borrar los ítems manuales.
- **Historial**: guarda las semanas planificadas para consultarlas o repetirlas.
- **Temas**: clásico, cool y oscuro, se eligen en Ajustes y se recuerdan en cada dispositivo.
- **Cuenta (nube)**: ingreso, registro, recuperación de contraseña y eliminación de cuenta.
- **PWA**: se instala en el celular, funciona sin conexión y se abre como app.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · Supabase (opcional) · vite-plugin-pwa

## Modo local y modo nube

La app detecta si hay credenciales de Supabase:

- **Sin credenciales** → modo local. Los datos quedan en `localStorage` de ese dispositivo. Ideal para probar.
- **Con credenciales** → modo nube. Cuenta con email/contraseña y datos sincronizados entre dispositivos.

### Configurar Supabase (para sincronizar)

1. Creá un proyecto gratis en [supabase.com](https://supabase.com).
2. Abrí **SQL Editor** y ejecutá completo [`supabase/schema.sql`](supabase/schema.sql).
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
Si usás Vercel/Netlify, cargá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como variables de entorno del proyecto.

## Modelo de datos

| Tabla | Para qué |
| --- | --- |
| `dishes` | Recetario: dificultad, minutos, tags, ingredientes (`jsonb`), pasos, freezer. |
| `plans` | Una fila por día: `week_start` (lunes), `day` 0–6, `mode`, `dish_id` y `note`. |
| `shopping_items` | Lista de compras por semana, con tildado y rubro. |

Todas las tablas tienen RLS: cada usuario solo accede a sus filas (`auth.uid() = user_id`).

## Ideas para seguir

- Fotos de los platos y recetas completas.
- Tema automático según la preferencia del sistema.
- Cantidad de comensales y escalado de ingredientes.
- "Ya lo cociné" para mejorar las sugerencias con el historial.
- Recordatorio semanal para planificar el domingo.
- Recetas compartidas entre cuentas.
