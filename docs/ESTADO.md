# Estado del proyecto · Comidas

> Última actualización: **14 de noviembre de 2026**.
> Guía técnica y de convenciones: [`DESARROLLO.md`](DESARROLLO.md).

## Resumen

La app está **funcional en modo local** y lista para probarse en el celular. Permite planificar
las cenas de la semana según la dificultad del día, elegir platos del recetario, generar la
lista de compras, consultar el historial y funcionar como PWA instalable.

El **modo nube está conectado a un proyecto real de Supabase**: se verificaron las tablas, RLS y el
endpoint de autenticación. Falta probar el registro y las escrituras de punta a punta con una
cuenta real.

## Qué está hecho

### Semana (pantalla principal)

- Navegación por semanas (lunes a domingo), con etiquetas “Esta semana / pasada / próxima”.
- Dificultad por día: Del freezer, Muy fácil, Fácil, Media, Elaborada.
- Sugerencias acordes a la dificultad, con opción de incluir platos más fáciles.
- “Sorpréndeme” por día y “Sorpréndeme” para completar toda la semana sin repetir platos.
- Cambiar dificultad conserva el plato si sigue siendo válido; si no, lo quita con aviso.
- Elegir plato, ver receta, pedir otra sugerencia o quitar el plato.
- Contador de cenas planificadas y acción para vaciar la semana.

### Recetario

- Búsqueda por nombre, ingrediente o etiqueta; filtros por dificultad, favoritos y freezer.
- Alta/edición de platos: nombre, dificultad, minutos, tags, ingredientes con rubro automático,
  pasos, link a la receta original, apto freezer y favorito.
- **Autocompletado de ingredientes** con el catálogo del recetario + una lista base: evita
  variantes como “Queso”, “queso” o “eso”. Ignora mayúsculas, tildes y espacios, y tolera
  errores de tipeo (“eso” encuentra “Queso”). Se puede elegir con mouse o teclado.
- Vista de receta en modo lectura desde el recetario y desde el día.
- Eliminar plato (se desasigna de los días donde estaba).

### Compras

- Generación de la lista desde los platos de la semana, agrupada por rubro.
- **Cuatro rubros fijos:** Verdulería, Supermercado, Dietética y Otros. El rubro se deduce del
  nombre del ingrediente y se puede cambiar a mano en el editor de platos.
- Suma cantidades numéricas y conserva los tildados al regenerar.
- Ítems manuales, tildado persistente y acción de compartir/copiar.
- Aviso de lista desactualizada cuando se agrega un plato sin ítems.

### Historial

- Semanas con actividad, ordenadas de más reciente a más antigua.
- Detalle por día, “Ver semana” y “Copiar a esta semana”.

### Ajustes

- **Tema de la interfaz:** clásico (cálido), cool (azul) y oscuro, con vista previa.
  Se aplica al instante y queda guardado en este dispositivo.
- Modo local/nube y cuenta (ingresar, crear cuenta, salir).
- Instalar PWA (con instructivo para iOS).
- Exportar/importar backup JSON.
- Cargar los 20 platos de ejemplo.
- Pasos para conectar Supabase.
- Leyenda de dificultades y borrado total de datos.

### Base técnica

- Adaptador de datos abstracto con implementaciones local (`localStorage`) y nube (Supabase).
- `supabase/schema.sql` con tablas, índices y RLS.
- PWA con manifest, íconos, service worker y precache.
- README en español con setup y deploy.
- Responsive mobile-first; sin desbordes horizontales a 390 px.

## Decisiones tomadas

| Decisión | Por qué |
| --- | --- |
| React + Vite + TypeScript | Stack simple, rápido y fácil de desplegar como sitio estático. |
| Tailwind v4 con tokens en `index.css` | Menos configuración y estilos consistentes con la identidad visual. |
| Modo local por defecto | Permite usar la app sin cuenta ni backend; ideal para empezar. |
| Supabase opcional | Cuenta y sincronización sin mantener un servidor propio. |
| `DataAdapter` | La UI no sabe si los datos son locales o remotos; se puede cambiar la persistencia. |
| Semana empieza lunes | Convención local y del público objetivo. |
| `weekStart` ISO (`yyyy-MM-dd`) | Simple de ordenar, comparar y guardar como `date` en Supabase. |
| Dificultad incluye `freezer` | Resuelve los días sin tiempo para cocinar. |
| Sugerencias aceptan dificultad igual o menor | Aumenta las opciones sin exigir más tiempo del elegido. |
| `HashRouter` | Deploy estático sin reglas de rewrite. |
| Estado con Context + acciones optimistas | Suficiente para el tamaño actual; sin dependencias extra. |
| 20 platos de ejemplo | La app se puede probar completa antes de cargar recetas reales. |
| Sin fotos por ahora | Menor complejidad; se puede sumar más adelante. |
| PWA `autoUpdate` | Las actualizaciones llegan sin que el usuario tenga que hacer nada. |
| Autocompletado de ingredientes con nombre canónico | Evita duplicados por mayúsculas, tildes o errores de tipeo en la lista de compras. |
| Cuatro rubros de compras (Verdulería, Supermercado, Dietética, Otros) | Menos secciones y más parecidas a cómo se recorre una compra real; lo que no encaja queda en Otros. |
| Categorización por la coincidencia más larga de palabras clave | Resuelve los casos mixtos: “tomate triturado” va a Supermercado y “arroz integral” a Dietética, en vez de depender del orden de la lista. |
| `normalizeCategory` reasigna rubros viejos | Los datos ya guardados (Frutas, Almacén, Lácteos y huevos…) se muestran en los rubros nuevos sin migración ni pérdida de datos. |
| Temas con variables CSS y `data-theme` | Un solo juego de utilidades Tailwind: el tema cambia redeclarando variables, sin duplicar clases ni componentes. |
| Preferencia de tema por dispositivo | Es una decisión de pantalla, no un dato de la cuenta; no se sincroniza con Supabase. |

## Verificado hasta ahora

- `npm run build` compila sin errores (TypeScript + Vite + PWA).
- Build con service worker: 25 archivos precacheados.
- Modo local: persistencia tras recargar; alta de platos; dificultad; sugerencias.
- Semana completa con “Sorpréndeme”.
- Subir dificultad conserva el plato y bajarla lo quita cuando corresponde
  (probado en navegador el 13/11/2026).
- Pantalla de login renderiza correctamente con credenciales dummy de Supabase,
  sin errores de consola.
- **Conexión al Supabase real (13/11/2026):** auth health/settings responden 200, el login
  con credenciales inválidas devuelve el error esperado (la publishable key se acepta) y las
  tablas `dishes`, `plans` y `shopping_items` responden 200 con RLS activo.
- Capturas revisadas a 390 px y en escritorio.
- **Autocompletado de ingredientes (14/11/2026):** probado en un build local (`dist-test`):
  “eso” sugiere y permite elegir “Queso”; “queso” se normaliza a “Queso” al salir del campo;
  “tofu ahumado” se guarda como “Tofu ahumado”; el plato se guarda con los nombres canónicos.
- **Temas (14/11/2026):** probados en un build local (`dist-test`) los tres temas:
  “Clásico”, “Cool” y “Oscuro”. El cambio es inmediato, `localStorage` guarda
  `comidas:theme`, la preferencia sobrevive a la recarga (sin destello) y
  `<meta name="theme-color">` cambia con el tema. Las cinco pantallas se ven sin
  desbordes horizontales ni errores de consola. Contraste AA en los tokens principales
  de cool y oscuro.
- **Rubros de compras (14/11/2026):** probado en un build local (`dist-test`) que la lista
  generada usa solo Verdulería, Supermercado, Dietética y Otros. Un “Sorpréndeme” completo
  produjo 27 ítems agrupados en Verdulería (12), Supermercado (14) y Dietética (1), sin
  categorías inválidas. Ítems manuales: Lentejas/Avena/Arroz integral → Dietética,
  Queso/Tomate triturado/Nuez moscada/Leche de coco → Supermercado, Manzana → Verdulería,
  Incienso → Otros. Los rubros viejos guardados en `localStorage` se muestran bajo el rubro
  nuevo correspondiente; en el editor de platos también se normalizan al abrir y al guardar.
  Sin errores de consola.
- Sin errores de página/consola en las pruebas realizadas.

## Limitaciones conocidas

- **Modo nube conectado, pero falta la prueba completa.** El schema, las tablas, RLS y el
  endpoint de auth ya se verificaron; falta registrarse, crear platos/menús y confirmar la
  sincronización entre dispositivos.
- **No hay tests automatizados ni linter.** La verificación es manual.
- **La lista de compras no convierte unidades.** “Aceite” en `ml` y en `cdas` aparece en
  dos líneas. Tampoco se puede borrar un ítem manual desde la UI (el método del adaptador existe).
- **La lista no detecta cambios internos de una receta.** Solo marca “desactualizada” cuando
  hay un plato planificado sin ítems; hay que regenerarla a mano.
- **El campo `note` de los días se guarda pero no tiene UI.**
- **No hay recuperación de contraseña, cambio de email ni borrado de cuenta.**
- **En modo nube no hay cola offline.** Sin red, las acciones fallan con un toast.
- **Importar en nube borra todo antes de insertar y no es transaccional.**
- **No hay sincronización en tiempo real.** Otro dispositivo ve los cambios al recargar.
- **El autocompletado no corrige ingredientes ya guardados.** Solo normaliza al editar o crear
  un plato; las variantes viejas (“queso”, “eso”) siguen en la base hasta corregirlas a mano.
- **El tema es por dispositivo.** No se guarda en la cuenta ni se sincroniza entre equipos.
- **El rubro es una sugerencia por nombre.** La autodetección cubre lo habitual, pero un
  ingrediente nuevo puede caer en “Otros”; se corrige a mano en el editor del plato.
- **Los rubros viejos se normalizan al mostrarse, no se reescriben.** Los datos guardados con
  categorías anteriores siguen así en la base hasta editar el plato o regenerar la lista.
- **Recetas de ejemplo provisorias.** Sirven para probar, no son el recetario definitivo.
- **Sin escalado por comensales ni fotos.**
- **El repo no está inicializado como git.** Conviene hacerlo para tener historial y respaldo.

## Pendientes priorizados

### P0 · Antes de usar la app en serio

1. **Inicializar git** (`git init`, `.gitignore` ya existe) y hacer el primer commit.
2. **Terminar de probar Supabase de punta a punta** con el proyecto real:
   - [x] ejecutar `supabase/schema.sql`;
   - [x] cargar las variables en `.env.local`;
   - [ ] registrar una cuenta y probar escrituras (crear plato, planificar, compras);
   - [ ] registrar una segunda cuenta y verificar que cada una ve solo sus datos (RLS);
   - [ ] configurar Redirect URLs para el deploy;
   - [ ] probar login en dos dispositivos.
3. **Reemplazar los platos de ejemplo por recetas reales** (o crear las propias y borrar los ejemplos).

### P1 · Próximas mejoras

4. Tests: Vitest para `suggest.ts`/`date.ts` y Playwright para los flujos críticos.
5. Compras: borrar ítems manuales, normalizar unidades y permitir editar cantidades.
6. Cuenta: recuperación de contraseña y borrado de cuenta.
7. UI para la nota del día (el dato ya existe en el modelo).
8. Manejo offline en nube (lectura en caché y reintento de escrituras).
9. Normalizar ingredientes ya guardados (por ejemplo, unificar “queso” y “Queso” en platos viejos).
10. Compras: unificar nombres de ingredientes al generar la lista (además de las cantidades).

### P2 · Ideas

11. Cantidad de comensales y escalado de ingredientes.
12. Fotos de platos.
13. “Ya lo cociné” para mejorar sugerencias con el historial.
14. Recordatorio semanal para planificar.
15. Compartir recetas o semanas entre cuentas.
16. Migraciones SQL versionadas (hoy el schema se corre a mano).
17. Atajos de PWA y tema automático según el sistema (`prefers-color-scheme`).

## Cómo retomar

1. Leer [`DESARROLLO.md`](DESARROLLO.md) (setup, arquitectura y convenciones).
2. `npm install` si hace falta y `npm run dev`.
3. Revisar los pendientes P0 de arriba.
4. Antes de cerrar una sesión de trabajo: `npm run build`, actualizar la bitácora y,
   si se agregó una decisión importante, sumarla a la tabla de decisiones.

## Bitácora

### 2026-11-13 · Primera versión completa

- Se armó el proyecto desde cero: Vite + React + TypeScript + Tailwind v4 + PWA.
- Se implementaron las cinco pantallas (Semana, Platos, Compras, Historial, Ajustes)
  y la pantalla de autenticación.
- Se creó el modelo de datos, el adaptador local y el adaptador Supabase con su schema y RLS.
- Se cargaron 20 platos vegetarianos de ejemplo.
- Se generaron los íconos PWA y se verificó el build con service worker.
- Verificación: build correcto, persistencia local, alta de platos, sugerencias, capturas
  a 390 px y en escritorio, login renderizado con credenciales dummy, sin errores de consola.
- **Corrección:** al cambiar la dificultad de un día se borraba siempre el plato. Ahora se
  conserva si sigue cumpliendo la nueva dificultad.
- **Corrección:** los platos de ejemplo usaban ids `seed-dish-N`, inválidos para las columnas
  `uuid` de Supabase. Ahora usan UUID fijos y, al importar un backup viejo en nube, los ids
  se regeneran y se remapean las referencias de planes y compras.
- **Limpieza:** se eliminaron los scripts temporales de capturas/auditoría y la dependencia
  `puppeteer-core` que se usaron solo durante el desarrollo.
- **Documentación:** se agregaron esta bitácora y la guía de desarrollo.

> Las capturas de la sesión quedaron en `C:/Users/isiga/AppData/Local/Temp/opencode/comidas-shots`
> (fuera del repo, es una carpeta temporal).

#### Conexión con Supabase (misma fecha)

- Se conectó el primer proyecto real de Supabase.
- **Corrección:** las credenciales estaban guardadas en `.env.example` y `.env.local` estaba vacío;
  se movieron a `.env.local` y se restauró `.env.example` con placeholders.
- **Corrección:** `VITE_SUPABASE_URL` incluía `/rest/v1/`. Se normalizó en `adapters/index.ts`
  para aceptar tanto la URL del proyecto como la de la API.
- Verificación: `/auth/v1/health` y `/auth/v1/settings` responden 200; login inválido devuelve
  `invalid_credentials` (key aceptada); las tres tablas responden 200 con RLS.
- `mailer_autoconfirm = true`: por ahora no hace falta confirmar el email al registrarse.
- **Corrección:** al guardar un día se enviaba `note: null`, pero la columna es `not null`.
  Ahora se envía `''` (también al importar backups). Requiere recargar la app para tomar el cambio.
- Pendiente inmediato: crear una cuenta en la app y probar escrituras reales.

### 2026-11-14 · Autocompletado de ingredientes

- Se agregó autocompletado al nombre de cada ingrediente en el editor de platos.
- **Archivos nuevos:** `src/lib/ingredients.ts` (catálogo, normalización y búsqueda) y
  `src/components/IngredientNameInput.tsx` (combobox accesible con teclado).
- **Catálogo:** ingredientes ya usados en el recetario (peso 10) + ~70 ingredientes comunes
  (peso 1). Los más usados aparecen primero al enfocar el campo.
- **Normalización:** sin mayúsculas, tildes ni espacios repetidos. Coincidencia exacta,
  prefijo, palabra, substring y errores de tipeo por distancia de edición.
- **Canonicalización:** al salir del campo y al guardar se usa el nombre canónico del catálogo;
  si no existe, se deja prolijo (“tofu ahumado” → “Tofu ahumado”).
- Verificación: “eso” → sugerencias de Queso; “queso” → “Queso” al hacer blur; plato guardado
  con “Queso” y “Tofu ahumado”; sin errores de consola ni desbordes horizontales.
- Se actualizaron `DESARROLLO.md` (comportamiento del catálogo) y este estado.

### 2026-11-14 · Temas: clásico, cool y oscuro

- Se agregó un selector de tema en **Ajustes → Apariencia**, con tres tarjetas de vista previa.
- **Archivo nuevo:** `src/lib/theme.ts` (ids, metadatos, lectura/guardado y aplicación del tema).
- **Implementación:** variables CSS. `html[data-theme="cool"]` y `html[data-theme="oscuro"]`
  redeclaran los tokens; sin atributo se usa el clásico. No se duplicaron clases de Tailwind.
- **Tokens nuevos:** `on-brand`, `field`, `favorite*`, `danger*` y `success*`; los colores de
  dificultad pasaron a `--mode-*` para que el tema oscuro los ajuste. Se reemplazaron los
  colores hex sueltos de los componentes.
- **Persistencia:** `localStorage` clave `comidas:theme`; se aplica antes de renderizar
  (script inline en `index.html` + `applyTheme(readTheme())` en `main.tsx`) para evitar el
  destello del tema anterior. También actualiza `<meta name="theme-color">`.
- **Decisión:** el tema es una preferencia del dispositivo, no se sincroniza con Supabase.
- Verificación: los tres temas cambian al instante, sobreviven la recarga y no generan
  errores de consola; probadas las cinco pantallas y las tarjetas del selector a 390 px.
- Se actualizaron `DESARROLLO.md` (sistema de temas) y `README.md`.

### 2026-11-14 · Rubros de compras: Verdulería, Supermercado, Dietética y Otros

- Se reemplazaron los rubros anteriores (Verdulería, Frutas, Almacén, Lácteos y huevos,
  Congelados, Panadería, Especias, Otros) por cuatro: **Verdulería, Supermercado, Dietética
  y Otros**.
- **`CATEGORIES` y `CATEGORY_COLORS`** se reescribieron: verde, azul, ámbar y gris.
- **`CATEGORY_KEYWORDS`** se reorganizó por rubro y `guessCategory()` ahora se queda con la
  **coincidencia más larga**, así lo específico gana: “tomate triturado” → Supermercado,
  “arroz integral” → Dietética, “nuez moscada” → Supermercado.
- **Archivo nuevo (función):** `normalizeCategory(category, ingredientName)` en
  `src/lib/constants.ts`. Si la categoría no es una de las cuatro, la deduce del nombre del
  ingrediente. Se usa en `buildShoppingItems`, `sortShopping` y `DishEditor` (visualización y
  guardado).
- **Datos de ejemplo:** los ingredientes de `seed.ts` se migraron a los rubros nuevos
  (lácteos, panadería, congelados y especias → Supermercado; legumbres, avena, tofu y seitan →
  Dietética).
- Verificación: 27 ítems generados solo en los rubros válidos; ítems manuales clasificados
  correctamente (incluidos los casos mixtos); rubros viejos en `localStorage` agrupados bajo el
  rubro nuevo; editor de platos con las cuatro opciones y normalización al guardar; sin errores
  de consola. `npm run build` correcto.
- Se actualizaron `DESARROLLO.md` (reglas de categorización) y `README.md`.
