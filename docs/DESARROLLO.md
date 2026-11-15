# Guía de desarrollo · Comidas

> Última revisión: **15 de noviembre de 2026**.
> Para el estado actual, pendientes y bitácora, ver [`ESTADO.md`](ESTADO.md).

## Retomar el proyecto en 5 minutos

1. Abrí una terminal en la raíz del repo.
2. Si es otra máquina o cambió `package.json`: `npm install`.
3. Iniciá el servidor: `npm run dev` → <http://localhost:5173>.
4. Sin `.env.local` la app muestra **“Falta configurar Supabase”**: no hay modo local para
   usuarios reales (solo para los tests de Playwright).
5. Antes de cambiar código, confirmá que compila: `npm run build`.
6. Leé [`ESTADO.md`](ESTADO.md) para saber qué está hecho y qué sigue.

> **Nota (Windows + npm 12):** en este entorno `npm run dev -- --port 5173` no siempre pasa el
> puerto. Si pasa, usá `npx vite --port 5173 --strictPort`.

## Stack

- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS v4** (configurado con `@theme` en `src/index.css`, sin `tailwind.config`)
- **vite-plugin-pwa** (service worker y manifest)
- **Supabase** (cuenta y sincronización; obligatorio para usar la app)
- **date-fns** (fechas en español, semana que empieza lunes)
- **lucide-react** (íconos), **clsx** (clases)
- Tipografías **Fraunces** (títulos) e **Inter** (texto), empaquetadas con `@fontsource-variable`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en el puerto 5173. |
| `npm run build` | Type-check (`tsc -b`) + build de producción en `dist/`. |
| `npm run preview` | Sirve `dist/` para probar el build y la PWA. |
| `npm test` | Corre los tests de lógica con Vitest (una vez). |
| `npm run test:watch` | Vitest en modo interactivo durante el desarrollo. |
| `npm run test:e2e` | Playwright sobre los flujos críticos en modo local de test (Chrome instalado). |
| `npm run icons` | Regenera los íconos PWA en `public/icons/` (usa `sharp`). |
| `npm install` | Instala dependencias. |

No hay linter. La lógica pura está cubierta con Vitest; los flujos visuales se prueban a mano
(ver “Verificación manual”).

## Modos de datos

La app elige el adaptador al arrancar en `src/lib/adapters/index.ts`, usando
`resolveAppMode` (`src/lib/appMode.ts`):

| Modo | Cuándo | Persistencia |
| --- | --- | --- |
| `cloud` | Hay `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. | Supabase + caché/cola offline. **Es el modo real.** |
| `e2e-local` | `import.meta.env.MODE === 'e2e'` **y** `VITE_E2E_LOCAL=1`. | `localStorage`, solo para Playwright. |
| `unconfigured` | Cualquier otro caso. | Pantalla “Falta configurar Supabase”. |

```ts
export function resolveAppMode(env: ModeEnv): AppMode {
  if (env.mode === 'e2e' && env.e2eLocal === '1') return 'e2e-local'
  return env.url.trim() && env.key.trim() ? 'cloud' : 'unconfigured'
}
```

**Todos los usuarios necesitan cuenta.** No hay modo local en producción: si faltan las
variables, la app no deja entrar a un almacenamiento local, muestra la pantalla de
configuración (`ConfigMissing` en `App.tsx`). El modo `e2e-local` existe solo para que
Playwright tenga un backend efímero y no pueda activarse en una build de producción.

### Modo nube (Supabase)

1. Crear proyecto en Supabase.
2. Ejecutar completo `supabase/schema.sql` en el **SQL Editor**. Es idempotente.
3. Copiar `.env.example` a `.env.local` y completar:
   ```bash
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. Reiniciar `npm run dev`. La app muestra la pantalla de ingreso/registro.

Detalles importantes:

- La `anon key` es pública: la seguridad real está en las políticas RLS del schema.
  **Nunca** pongas la `service_role` en el frontend.
- Por defecto Supabase pide confirmar el email. Para probar rápido:
  **Authentication → Sign In / Providers → Email → Confirm email: off**.
- En producción, configurá **Authentication → URL Configuration** con la URL del deploy
  (Site URL y Redirect URLs), si no el link de confirmación vuelve a localhost.
- Las tablas (`dishes`, `plans`, `shopping_items`) usan `uuid`, `week_start` como `date`,
  `day` 0–6 y RLS por `auth.uid() = user_id`.
- `schema.sql` también define `public.delete_my_account()` (`security definer`, `set
  search_path = public`), que borra la fila de `auth.users`; las tablas públicas se limpian por
  `on delete cascade`. Solo la puede ejecutar `authenticated`.
- **Recuperación de contraseña:** en Supabase, agregá la URL del deploy (y `localhost:5173` para
  probar) en **Authentication → URL Configuration → Redirect URLs**. El link vuelve a la app con
  `type=recovery` en el hash; `recovery.ts` lo detecta y muestra la pantalla de contraseña nueva.
- El adaptador traduce camelCase (`freezerFriendly`, `dishId`) ↔ snake_case
  (`freezer_friendly`, `dish_id`) en `src/lib/adapters/cloud.ts`.
- Al cargar ejemplos o importar un backup, los ids que no son UUID se regeneran y se
  remapean las referencias de planes/compras (necesario para las columnas `uuid`).
- `importAll` en nube **borra** los datos actuales antes de insertar el backup, sin
  transacción. Si algo falla a mitad, puede quedar información incompleta.

### Modo offline (solo nube)

`createOfflineAdapter` envuelve al adaptador de Supabase (`src/lib/adapters/offline.ts`) y agrega
dos cosas, siempre **por usuario**:

- **Caché de lectura** en `localStorage`:
  - `comidas:cache:v1:<userId>:dishes`
  - `comidas:cache:v1:<userId>:plans`
  - `comidas:cache:v1:<userId>:shopping` (un objeto `weekStart → items`)

  Si una lectura falla por red, se devuelven los últimos datos guardados. Si nunca se leyó esa
  semana, se lanza un error (“Sin conexión y no hay datos guardados…”) en vez de inventar una
  lista vacía.
- **Cola de escrituras** en `comidas:queue:v1:<userId>`: solo se encolan errores de red
  (`isOfflineError`). Un error de RLS/validación se muestra y se descarta esa operación, porque
  reintentarla no lo arregla. Al volver `online` (o al abrir la app) se hace `flush()` en orden y
  se compactan escrituras repetidas del mismo día.
- **Optimismo:** antes de escribir se actualiza la caché; así la UI ve el cambio aunque la
  operación quede pendiente.
- **Compras:** `replaceShopping` solo se encola si esa semana ya estaba cacheada, para no pisar
  en el servidor una lista que nunca se llegó a leer.
- **Ejemplos offline:** `seedDishes` normaliza los ids a UUID y encola un `saveDish` por plato.
- La UI muestra el estado en `Shell` (`OfflineBanner`): sin conexión, sincronizando o “N cambios
  pendientes”, con botón **Reintentar**. `AppContext` expone `offlineStatus` y `retrySync`, y al
  terminar la cola relee platos/planes/compras del servidor.

La cola y la caché viven en el dispositivo: si se borran los datos del navegador antes de
sincronizar, esos cambios pendientes se pierden. Tampoco hay resolución de conflictos (gana la
última escritura que llega) ni sincronización en tiempo real.

## Sistema de temas

La app tiene tres temas: **clásico** (por defecto, cálido), **cool** (azul) y **oscuro**.
Se eligen en **Ajustes → Apariencia** y se guardan solo en el dispositivo.

### Cómo funciona

- Los tokens viven en `src/index.css`. `@theme` define los valores del tema clásico.
- Los temas alternativos se activan con un atributo en `<html>` y redeclaran las variables:

  ```css
  html[data-theme='cool'] { --color-brand: #2563eb; /* … */ }
  html[data-theme='oscuro'] { color-scheme: dark; --color-brand: #5db98d; /* … */ }
  ```

- Las utilidades de Tailwind (`bg-cream`, `text-ink`, `bg-brand-soft`…) leen esas variables,
  así que **no hace falta duplicar clases ni componentes** por tema.
- `src/lib/theme.ts` expone `THEMES`, `readTheme()`, `applyTheme()` y `storeTheme()`.
  La clave de `localStorage` es `comidas:theme` (`clasico | cool | oscuro`).
- `index.html` tiene un script inline que aplica `data-theme` **antes** de cargar CSS/JS,
  y `main.tsx` llama a `applyTheme(readTheme())` antes de montar React. Así no se ve el
  destello del tema anterior al recargar.
- `applyTheme()` también actualiza `<meta name="theme-color">` para la barra del navegador.

### Tokens semánticos

Además de los colores base (`cream`, `surface`, `ink`, `muted`, `line`, `brand`, `accent`),
hay tokens pensados para no volver a escribir hex en los componentes:

| Token | Uso |
| --- | --- |
| `on-brand` | Texto/ícono sobre `bg-brand` (botón primario, logo, check). |
| `field` | Fondo de inputs y selects (puede diferir de `surface`). |
| `favorite`, `favorite-soft`, `favorite-ink` | Estrella, chip de favorito y su texto. |
| `danger-soft`, `danger-ink`, `danger-strong`, `danger-border` | Errores, borrar, zona peligrosa. |
| `success-soft`, `success-ink`, `success-border` | Avisos y toasts de éxito. |

Los colores de dificultad se movieron a variables `--mode-<id>` y `--mode-<id>-soft`; el tema
oscuro define versiones más claras. `modeBorder()` en `src/lib/constants.ts` genera el borde
translúcido con `color-mix`, porque los valores ahora son `var(...)` y no se les puede pegar
un sufijo hex como `55`.

### Reglas al escribir estilos

- No uses `text-white`, `bg-white` ni hex sueltos en componentes: usá los tokens.
- La opacidad va con la sintaxis de Tailwind (`bg-brand/40`) o `color-mix`; **nunca**
  concatenes `color + '55'` si el color puede ser una variable CSS.
- Si agregás un color nuevo, definilo en `@theme` **y** en los dos temas alternativos.
- El tema oscuro ajusta también `color-scheme: dark` y los `--mode-*`.

### Agregar un tema

1. Sumar el id y los metadatos (nombre, descripción, `themeColor` y colores de la vista previa)
   en `THEMES` (`src/lib/theme.ts`).
2. Agregar el bloque `html[data-theme='nuevo']` en `src/index.css` redeclarando todos los
   tokens: base, superficies, marca, acento, campo, favorito, peligro, éxito, sombras,
   `--body-glow` y (si hace falta) `--mode-*`.
3. Si el tema es oscuro, incluir `color-scheme: dark`.
4. Probar cambio inmediato, recarga sin destello, `<meta name="theme-color">`, las cinco
   pantallas y el contraste de textos.

## Estructura del proyecto

```text
Comidas/
├─ src/
│  ├─ App.tsx                  # Gate de sesión + HashRouter + rutas
│  ├─ main.tsx                 # Aplica el tema, monta React y registra la PWA
│  ├─ index.css                # Tailwind v4, tokens (@theme) y temas cool/oscuro
│  ├─ types.ts                 # Tipos de dominio y contrato DataAdapter
│  ├─ state/AppContext.tsx     # Estado global y todas las acciones
│  ├─ lib/
│  │  ├─ adapters/index.ts     # Elige nube / test local / sin configurar
│  │  ├─ adapters/local.ts     # Persistencia en localStorage (solo tests)
│  │  ├─ adapters/cloud.ts     # Supabase (auth + CRUD + import/export)
│  │  ├─ adapters/offline.ts   # Caché de lectura y cola de escrituras por usuario
│  │  ├─ appMode.ts            # cloud | e2e-local | unconfigured
│  │  ├─ uuid.ts               # isUuid / newUuid compartidos
│  │  ├─ suggest.ts            # Sugerencias y armado de lista de compras
│  │  ├─ ingredients.ts        # Catálogo, normalización y búsqueda de ingredientes
│  │  ├─ constants.ts          # Modos, colores, categorías, categorización
│  │  ├─ date.ts               # Semanas (lunes), formatos en español
│  │  ├─ theme.ts              # Temas: ids, persistencia y aplicación
│  │  ├─ recovery.ts           # Detecta el link de recuperación al arrancar
│  │  └─ useInstallPrompt.ts   # Hook de instalación PWA
│  ├─ data/seed.ts             # 20 platos vegetarianos de ejemplo (ids UUID fijos)
│  ├─ components/
│  │  ├─ ui.tsx                # Button, Chip, Input, Sheet, EmptyState, Toaster…
│  │  ├─ Shell.tsx             # Layout, nav inferior, ScreenHeader
│  │  ├─ DayCard.tsx           # Tarjeta de un día
│  │  ├─ ModeChips.tsx         # Chips de dificultad y etiqueta de modo
│  │  ├─ DishPickerSheet.tsx   # Selector de plato del día
│  │  ├─ DishEditor.tsx        # Alta/edición de receta
│  │  ├─ IngredientNameInput.tsx # Autocompletado de ingredientes
│  │  └─ DishDetail.tsx        # Receta en modo lectura
│  └─ screens/
│     ├─ WeekScreen.tsx        # Pantalla principal (semana)
│     ├─ DishesScreen.tsx      # Recetario
│     ├─ ShoppingScreen.tsx    # Lista de compras
│     ├─ HistoryScreen.tsx     # Historial de semanas
│     ├─ SettingsScreen.tsx    # Ajustes, cuenta, backup, PWA
│     ├─ AuthScreen.tsx        # Login/registro/recuperar (cuenta obligatoria)
│     └─ ResetPasswordScreen.tsx # Contraseña nueva desde el link de recovery
├─ index.html                  # Script que aplica el tema antes del primer render
├─ supabase/schema.sql         # Tablas + RLS + delete_my_account()
├─ tests/                      # Vitest (date, constants, suggest, ingredients, appMode, offline)
├─ tests/e2e/                  # Tests de Playwright (semana, plato, compras, temas)
├─ tests/e2e/env/.env          # Entorno de test (VITE_E2E_LOCAL=1) para forzar el modo local
├─ vitest.config.ts            # Configuración de Vitest
├─ playwright.config.ts        # Configuración de Playwright (Chrome instalado)
├─ public/icons/               # Íconos PWA generados
├─ docs/                       # Esta guía y estado del proyecto
└─ vite.config.ts              # Manifest y service worker
```

## Rutas

`HashRouter`: las URLs son `/#/`, `/#/platos`, etc. No hacen falta rewrites en el hosting.

| Ruta | Pantalla |
| --- | --- |
| `#/` | Semana actual (o la que se esté navegando) |
| `#/platos` | Recetario con búsqueda y filtros |
| `#/compras` | Lista de compras de la semana visible |
| `#/historial` | Semanas con actividad |
| `#/ajustes` | Cuenta, backup, ejemplos, PWA, Supabase, borrar datos |
| `*` | Redirige a `#/` |

## Modelo de datos

### Tipos de la app (`src/types.ts`)

- `Difficulty`: `muy-facil | facil | media | elaborada`
- `DayMode`: `Difficulty | freezer` (lo que se elige por día)
- `Dish`: nombre, dificultad, minutos, tags, ingredientes, pasos, fuente, freezer, favorito.
- `DayPlan`: `day` 0–6 (0 = lunes), `mode`, `dishId`, `note`.
- `WeekPlan`: `weekStart` (ISO `yyyy-MM-dd`, lunes) + 7 días.
- `ShoppingItem`: texto, tildado, rubro, `dishId` de origen.
- `Snapshot`: backup versionado (`app: 'comidas'`, `version: 1`) con platos, planes y compras.

### Convenciones de fechas

- `weekStart` es siempre el **lunes** de la semana, en ISO local (`2026-11-09`).
- `day` va de **0 (lunes) a 6 (domingo)**.
- Se usa `date-fns` con locale `es`; evitar `new Date(string)` para fechas ISO
  (usar `parseISO` o construir con `T12:00:00` para evitar corrimientos de zona).

### Tablas de Supabase

| Tabla | Filas | Notas |
| --- | --- | --- |
| `dishes` | Una por plato | `ingredients` es `jsonb`, `tags` es `text[]`. |
| `plans` | Una por día/semana | `unique(user_id, week_start, day)`; upsert con ese conflicto. |
| `shopping_items` | Una por ítem/semana | Se reemplaza la semana completa al guardar. |

## Flujos clave

### Semana y persistencia

- `AppContext` carga **todos** los planes del usuario (`listPlans`) y deriva los 7 días
  de `weekStart`. Cambiar de semana es solo estado local.
- Las acciones son **optimistas**: actualizan el estado y luego escriben en el adaptador.
  Si falla, muestran un toast y recargan todo (`reloadAll`).
- Cambiar dificultad conserva el plato si sigue siendo válido; si no, lo quita
  (`setDayMode` usa `matchesMode`). La tarjeta avisa cuando el plato se quitó.
- `repeatWeek` copia los días con actividad de otra semana sobre la semana visible,
  día por día. No borra los días que no estén en la semana origen.
- **Nota del día:** `setDayNote(day, texto)` guarda el campo `note` (texto libre). Se abre
  desde la tarjeta con un `Sheet`; no participa de sugerencias ni de compras.

### Sugerencias

En `src/lib/suggest.ts`:

- `matchesMode(dish, mode, includeEasier = true)`:
  - `freezer` exige `freezerFriendly`.
  - El resto acepta platos de dificultad **igual o menor** (por defecto).
- `pickSuggestion`:
  - Excluye platos ya usados en la semana; si el pool queda vacío, reintenta sin exclusiones.
  - Ponderación: favorito ×2.2, coincidencia exacta de dificultad ×1.6, freezer ×1.2.
- `suggestWeek` completa solo días sin plato; los días sin dificultad asumen `facil`.
- `shuffleDay` (botón de dados) usa la dificultad del día, o `facil` si no hay.

### Autocompletado de ingredientes

En `src/lib/ingredients.ts` + `src/components/IngredientNameInput.tsx`:

- **Catálogo** (`buildIngredientCatalog(dishes)`): ingredientes del recetario (peso 10) +
  `COMMON_INGREDIENTS` (~70 base, peso 1). Se ordena por uso y luego alfabéticamente.
- **Normalización** (`normalizeIngredientName`): minúsculas, sin tildes, espacios colapsados.
  Así “Queso”, “queso” y “ QUESO ” comparten la misma clave.
- **Búsqueda** (`searchIngredients`): exacta → prefijo → palabra → substring → distancia de
  edición (≤2 por palabra, solo desde 3 caracteres). “eso” y “qeso” encuentran “Queso”.
- **Canonicalización** (`canonicalIngredientName`): al salir del campo (`blur`) y al guardar el
  plato se reemplaza por el nombre canónico del catálogo; si no existe, se aplica
  `formatIngredientName` (primera letra en mayúscula).
- **UI:** input con `role="combobox"`, lista `role="listbox"`, navegación con ↑/↓, Enter para
  elegir, Escape para cerrar. Al enfocar sin texto muestra los ingredientes más usados.
- **Para ampliar la lista base:** agregar nombres a `COMMON_INGREDIENTS`. No hace falta tocar
  la base de datos: el catálogo se arma en memoria a partir de los platos del usuario.
- **Limitación:** no reescribe platos ya guardados; solo normaliza al crear o editar.

### Lista de compras

- Se genera **a pedido** (“Generar”/“Actualizar”) desde los platos de la semana.
- Agrupa por `categoría | nombre normalizado | dimensión de unidad`. Los nombres se comparan
  sin mayúsculas, tildes ni espacios de más.
- **Conversión de unidades** (`UNIT_ALIASES` en `suggest.ts`):
  - masa: `g`, `gr`, `gramo(s)`, `kg`, `kilo(s)` (base g);
  - volumen: `ml`, `mililitro(s)`, `l`, `lt`, `litro(s)`, `cda(s)`, `cucharada(s)` (15 ml),
    `cdta(s)`, `cucharadita(s)` (5 ml), `taza(s)` (240 ml) (base ml);
  - cantidad: `u`, `un`, `unidad(es)`.
  - Si todas las cantidades usan la misma unidad de cocina, se mantiene (`3 cda`, `1.5 kg`);
    si se mezclan dimensiones compatibles, se muestra la más legible (`215 ml`, `1.5 l`).
  - Las unidades libres (`puñado`, `lata`, vacío) se unen con ` + ` y nunca se convierten.
- Si todas las cantidades son numéricas, se suman; si no, se listan sin repetir.
- `mergeShopping(previous, fresh, makeId)` reemplaza lo generado por recetas y conserva:
  - los **tildados** (por texto y por nombre de ingrediente);
  - los **ítems manuales** (`dishId: null`), con su id y edición.
- **Editar/borrar:** en la UI solo se muestran los botones para ítems manuales. Usan
  `updateShoppingItem` y `deleteShoppingItem`; los generados se cambian desde la receta y
  regenerando.
- `shoppingOutdated` marca la lista como desactualizada cuando hay un plato planificado
  sin ítems asociados. Cambios internos de una receta no se detectan: hay que regenerar.

### Rubros de compras

Los rubros son exactamente cuatro, en este orden:

| Rubro | Qué agrupa | Color |
| --- | --- | --- |
| **Verdulería** | Frutas, verduras, hortalizas y aromáticas frescas. | Verde |
| **Supermercado** | Lácteos, huevos, panadería, congelados, especias, almacén y envasados. | Azul |
| **Dietética** | Legumbres, cereales integrales, frutos secos, semillas, avena, tofu, seitan, tahini. | Ámbar |
| **Otros** | Lo que no coincide con ninguna palabra clave. | Gris |

Todo está en `src/lib/constants.ts`:

- `CATEGORIES`: los cuatro nombres. Es la única fuente de verdad para el `<select>` del editor,
  el orden de los grupos y las claves de color.
- `CATEGORY_COLORS`: color de cada rubro (se usa como punto en la lista).
- `CATEGORY_KEYWORDS`: palabras clave por rubro. Se comparan contra el nombre en minúsculas.
- `guessCategory(name)`: recorre **todos** los pares rubro/palabra y se queda con la
  **coincidencia más larga**. Así lo específico gana sobre lo genérico:
  - `tomate triturado` → Supermercado (gana “tomate triturado” sobre “tomate”).
  - `arroz integral` → Dietética (gana “arroz integral” sobre “arroz”).
  - `nuez moscada` → Supermercado (gana “nuez moscada” sobre “nuez”).
  - `harina integral` → Dietética (gana “harina integral” sobre “harina”).
  - Si no hay coincidencia → Otros.
- `normalizeCategory(category, ingredientName)`: si la categoría no es una de las cuatro
  (datos viejos como `Frutas`, `Almacén`, `Lácteos y huevos`, `Panadería`, `Especias`…),
  la deduce del nombre del ingrediente; si no hay nombre, devuelve Otros. Se aplica en
  `buildShoppingItems`, al ordenar/agrupar (`sortShopping`) y en el editor de platos.

**Cómo agregar o ajustar palabras clave:** sumarlas al array del rubro en
`CATEGORY_KEYWORDS`. No hace falta migrar datos ni tocar Supabase (`category` es texto libre).
Si una palabra nueva choca con otra, recordá que gana la más larga, no la primera.

### Historial

- No hay tabla extra: el historial son las semanas con al menos un plan con `mode` o `dishId`.
- Se ordena de más reciente a más antigua. “Ver semana” navega a esa semana y
  “Copiar a esta semana” usa `repeatWeek`.
- Vaciar una semana también elimina su lista de compras.

### Autenticación (cuenta obligatoria)

- `AuthScreen` maneja ingreso, registro y **recuperación de contraseña** (`mode` `in | up |
  forgot`). Si el registro requiere confirmación, muestra un aviso.
- **Recovery:** `resetPassword(email)` llama a `supabase.auth.resetPasswordForEmail` con
  `redirectTo` a la URL actual. El link vuelve con `type=recovery` en el hash.
- `src/lib/recovery.ts` se evalúa antes que el cliente de Supabase y guarda la intención en
  `sessionStorage` (`comidas:recovery`), porque auth-js puede borrar el hash al detectar la
  sesión. `App.tsx` muestra `ResetPasswordScreen` si hay recuperación pendiente.
- `updatePassword(password)` usa `supabase.auth.updateUser`. Al guardar o “Volver al ingreso”
  se limpia la marca y se restaura `#/`.
- **Eliminar cuenta:** `deleteAccount()` llama a `supabase.rpc('delete_my_account')`. La función
  del schema borra la fila de `auth.users`; las tablas públicas caen por `on delete cascade`.
  Si falta la función, el adaptador muestra un mensaje pidiendo ejecutar `schema.sql`.
- Los errores comunes de Supabase se traducen al español en `cloud.ts`.

## Convenciones

- **Idioma:** todo el texto visible en español rioplatense (voseo: “elegí”, “probá”).
  Días y meses en minúscula dentro de oraciones.
- **Estilos:** usar los tokens de `index.css` (`bg-cream`, `text-ink`, `text-brand`…).
  Evitar colores sueltos: si un color no existe como token, agregalo en `@theme` y en los
  temas alternativos (ver “Sistema de temas”).
- **Componentes:** reutilizar `Button`, `Chip`, `Input`, `Sheet`, `EmptyState`, `ScreenHeader`.
  Los modales usan `Sheet` (portal + `role="dialog"`).
- **Estado:** no hay Redux/Zustand; todo pasa por `useApp()`.
- **IDs:** `makeId()` (UUID) para datos nuevos. Los ejemplos usan UUID fijos válidos.
- **Tipos:** agregar campos en `types.ts` y actualizar los dos adaptadores + schema.
- **Accesibilidad:** botones con `aria-label` cuando son solo ícono; foco visible;
  la app se probó a 390 px de ancho.

## Recetas para extender

### Agregar o cambiar platos de ejemplo

Editar `src/data/seed.ts` (helper `dish(...)` e `ing(...)`). Los ids se generan como UUID
fijos con `seedDishId`, así que mantener el patrón. Los ejemplos nuevos se cargan desde
**Ajustes → Cargar platos de ejemplo** (evita duplicados por nombre).

### Agregar una categoría de compras

Hoy son cuatro rubros fijos y no se recomienda sumar más sin revisar la UI.

1. Sumar el nombre en `CATEGORIES` (`src/lib/constants.ts`).
2. Agregar color en `CATEGORY_COLORS`.
3. Agregar palabras clave en `CATEGORY_KEYWORDS` para la autodetección.
4. Revisar `normalizeCategory`: si la categoría nueva debe conservarse, ya la acepta por estar
   en `CATEGORIES`.
5. Actualizar la tabla de rubros de esta guía y el estado del proyecto.

No hace falta tocar la base: `category` es texto libre.

Para **ajustar** la autodetección alcanza con editar `CATEGORY_KEYWORDS`: gana la palabra más
larga que coincida con el nombre del ingrediente. Los rubros viejos guardados se normalizan al
mostrarse y al editar el plato.

### Agregar una pantalla

1. Crear el componente en `src/screens/`.
2. Registrar la ruta en `src/App.tsx`.
3. Si va en la navegación inferior, agregar el ítem en `TABS` (`src/components/Shell.tsx`).

### Agregar un campo a `Dish`

Checklist: `types.ts` → `DishEditor` (form) → `DishDetail` (lectura) → mapeos en
`adapters/cloud.ts` (`DishRow`, `mapDish`, `toDishRow`) → `supabase/schema.sql`
(columna + `alter table` si ya existe la tabla) → seed si aplica.

### Cambiar las reglas de sugerencia

Todo está en `src/lib/suggest.ts`. Si cambiás la ponderación o el filtro, revisá también
`DishPickerSheet` (usa `candidatesFor`) y `DayCard` (usa `matchesMode`).

## Tests

`npm test` corre [Vitest](https://vitest.dev/) sobre `tests/**/*.test.ts` en entorno `node`
(config en `vitest.config.ts`). No monta React ni navegador: prueba la lógica pura.

| Archivo | Qué cubre |
| --- | --- |
| `tests/date.test.ts` | Semana que empieza lunes, suma/resta, rangos y etiquetas en español. |
| `tests/constants.test.ts` | Los cuatro rubros, clasificación y palabra clave más larga. |
| `tests/suggest.test.ts` | Dificultades, suma/conversión de unidades, tildados y manuales al regenerar. |
| `tests/ingredients.test.ts` | Normalización, nombre canónico, catálogo y búsqueda tolerante a errores. |
| `tests/appMode.test.ts` | Cuenta obligatoria: `cloud`, `unconfigured` y modo local solo con `--mode e2e` + `VITE_E2E_LOCAL=1`. |
| `tests/offline.test.ts` | Errores de red, caché de lectura, cola por usuario, compactación, errores de RLS y ejemplos offline. |

Para agregar un test, creá `tests/<tema>.test.ts` e importá desde `../src/...`. Si una función
necesita `window`/`localStorage`, o se prueba con Playwright o se extrae la lógica pura a
`src/lib` para poder testearla en `node`.

### Tests de interfaz (Playwright)

`npm run test:e2e` levanta Vite en `http://localhost:5175` con `--mode e2e` y corre los tests de
`tests/e2e/*.spec.ts` en Chrome (canal `chrome`, sin descargar navegadores). El modo `e2e` usa
`tests/e2e/env/.env` como `envDir` (ver `vite.config.ts`), así que **no toma** el `.env.local`
real; ese archivo define `VITE_E2E_LOCAL=1`, la única combinación que habilita el modo local de
test con los 20 platos de ejemplo. En una build de producción esa variable se ignora.

| Archivo | Qué cubre |
| --- | --- |
| `tests/e2e/week.spec.ts` | “Sorpréndeme” completa la semana, persiste al recargar y se elige un plato según la dificultad. |
| `tests/e2e/dishes.spec.ts` | Alta de plato con autocompletado “eso” → “Queso”, guardado y persistencia. |
| `tests/e2e/shopping.spec.ts` | Lista agrupada por rubros, tildado e ítem manual (alta y borrado). |
| `tests/e2e/themes.spec.ts` | Tema oscuro aplicado, color de barra y persistencia tras recargar; vuelta a clásico. |

Cada test usa un contexto nuevo, así que el `localStorage` arranca limpio. Si Playwright falla,
deja capturas/traza en `test-results/` (ignorado por git).

## Verificación manual

Antes de publicar, correr `npm test` y probar en `npm run dev`:

- [ ] La semana navega adelante/atrás y recuerda la dificultad y el plato tras recargar.
- [ ] “Sorpréndeme” completa días vacíos sin repetir platos.
- [ ] Subir dificultad conserva el plato; bajarla lo quita si ya no entra.
- [ ] Agregar una nota a un día, recargar y ver que sigue ahí.
- [ ] Elegir plato, ver receta, editarla y volver a la semana.
- [ ] Crear un plato con ingredientes; aparece en el recetario y en sugerencias.
- [ ] En el editor, escribir “eso” y elegir “Queso” del autocompletado; al salir del campo
      “queso” debe quedar como “Queso” y guardarse así.
- [ ] Ajustes → “Normalizar ingredientes” unifica variantes viejas y informa cuántos cambió.
- [ ] Generar compras, tildar ítems, recargar y verificar que siguen tildados.
- [ ] Un ingrediente repetido en dos platos (500 g + 1 kg, 200 ml + 1 cda) aparece en una sola
      línea con la cantidad convertida.
- [ ] Agregar un ítem manual, editarlo y borrarlo; regenerar y confirmar que el manual sigue.
- [ ] La lista muestra solo los rubros Verdulería, Supermercado, Dietética y Otros (sin
      encabezados viejos como Frutas, Almacén o Especias).
- [ ] Agregar “Tomate triturado”, “Arroz integral” y “Nuez moscada” como ítems manuales:
      deben caer en Supermercado, Dietética y Supermercado respectivamente.
- [ ] En el editor de platos, el selector de rubro muestra las cuatro opciones y los platos
      viejos aparecen con un rubro válido.
- [ ] Copiar una semana del historial y vaciar la semana actual.
- [ ] Exportar JSON e importarlo (probar en local; en nube tener cuidado, reemplaza todo).
- [ ] En Ajustes, cambiar entre Clásico, Cool y Oscuro; recargar y verificar que se mantiene
      sin destello y que la barra del navegador toma el color del tema.
- [ ] Con cada tema, recorrer las cinco pantallas y revisar contraste y desbordes.
- [ ] En nube: “¿Olvidaste tu contraseña?” manda el email y el link abre la pantalla de
      contraseña nueva; “Volver al ingreso” descarta el cambio.
- [ ] En nube: “Eliminar mi cuenta” pide doble confirmación y, si falta el schema nuevo,
      muestra el aviso correspondiente.
- [ ] Cerrar sesión: la app vuelve al login y no deja ver datos sin cuenta.
- [ ] Sin variables de Supabase, una build muestra “Falta configurar Supabase” (no un modo local).
- [ ] Offline: con la app abierta, cortar la red; se ve el aviso “Sin conexión”. Navegar y
      cambiar algo (por ejemplo, una nota o un plato); sigue funcionando con la caché.
- [ ] Volver a conectar: la cola se sincroniza sola o con “Reintentar”; el aviso desaparece y,
      tras recargar, los cambios están en Supabase.
- [ ] `npm run build` y `npm run preview`: la PWA se instala y funciona offline.
- [ ] Sin errores en la consola del navegador.

Los flujos críticos también corren automatizados con Playwright (`npm run test:e2e`).
Los scripts temporales de capturas/auditoría usados durante el desarrollo se eliminaron a
propósito.

## Deploy y PWA

- Es un sitio estático: build `npm run build`, publicar `dist/`.
- Sirve en Vercel, Netlify, Cloudflare Pages, GitHub Pages o cualquier hosting estático.
- Cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como variables de entorno del
  proyecto **en tiempo de build** (Vite las inyecta al compilar). Son obligatorias: sin ellas la
  app pública muestra “Falta configurar Supabase”. En Vercel, marcalas para **Production** y
  **Preview**.
- Después del primer deploy, agregá la URL pública en Supabase
  (**Authentication → URL Configuration**: Site URL y Redirect URLs) para confirmación de email y
  recuperación de contraseña.
- **Deploy actual:** <https://comidas-pi.vercel.app> (proyecto `comidas`, conectado a
  `moloyo/FoodOrganizer`). Para redesplegar: `npx vercel --prod`.
- Para instalar la PWA hace falta **HTTPS** (o `localhost`).
- El service worker usa `registerType: 'autoUpdate'` y precachea JS/CSS/HTML/fuentes/íconos.
  Tras un deploy, puede hacer falta recargar una vez para tomar la versión nueva.
- En iOS no existe `beforeinstallprompt`: Ajustes muestra el instructivo de
  “Compartir → Agregar a pantalla de inicio”.
- El manifest usa `start_url: '/'` y `HashRouter`; no configures rewrites especiales.

## Problemas comunes

| Síntoma | Causa probable / solución |
| --- | --- |
| “Falta configurar Supabase” | Faltan `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` en `.env.local` (o en las variables del deploy). La app exige cuenta; no hay modo local para usuarios. |
| Aparece el login y no quería | Es el comportamiento esperado: la cuenta es obligatoria. Para los tests existe el modo `e2e-local`, no para uso real. |
| “Email o contraseña incorrectos” | Credenciales mal, o el usuario no existe. |
| “Confirmá tu email antes de ingresar” | Confirmación activa en Supabase; revisá el correo o desactivala para probar. |
| Error de `uuid` al importar/cargar ejemplos | Ya se normalizan ids; si persiste, revisá que el schema tenga las columnas `uuid`. |
| La PWA no se instala | Falta HTTPS o el manifest no cargó; probá `npm run build && npm run preview`. |
| Cambios que no aparecen | Service worker con caché vieja: recargá o “Actualizar” en el navegador. |
| El puerto 5173 está ocupado | Cerrá el proceso de Vite anterior o usá `--strictPort` para ver el error. |
| Error `null value in column "note"` al guardar un día | Corregido: la app ahora manda `''`. Recargá con `Ctrl+Shift+R` para cargar el adaptador nuevo. |
| “Falta actualizar el schema…” al eliminar la cuenta | Volvé a ejecutar `supabase/schema.sql`: define `delete_my_account()`. |
| El link de recuperación abre la app pero no la pantalla nueva | Verificá `type=recovery` en la URL y que `src/lib/recovery.ts` se importe antes que `App` en `main.tsx`. |
| Los ingredientes no se autocompletan | El catálogo se arma con tus platos + lista base; recargá la página para tomar la versión nueva. |
| Un ítem manual desapareció al regenerar | Debe tener `dishId: null`; si se importó desde un backup viejo, revisá el JSON. |
| Se ve un destello del tema claro al recargar | Revisá que el script inline de `index.html` esté antes del CSS/JS y que `comidas:theme` sea válido. |
| La lista de compras no refleja un cambio de receta | Regenerala; la app solo detecta platos nuevos, no cambios internos. |
| Un cambio hecho sin conexión no aparece en Supabase | Mirá el aviso de cambios pendientes y tocá “Reintentar”; si la sesión expiró, volvé a ingresar. |
| El primer arranque sin red no muestra datos | La caché se llena en la primera lectura online; sin datos guardados la app avisa que no hay nada. |
| Los tests fallan por `window is not defined` | Vitest corre en `node`: mové la lógica pura a `src/lib` o agregá un entorno `jsdom` solo para ese archivo. |
