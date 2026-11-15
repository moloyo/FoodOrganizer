# Estado del proyecto · Comidas

> Última actualización: **15 de noviembre de 2026**.
> Guía técnica y de convenciones: [`DESARROLLO.md`](DESARROLLO.md).

## Resumen

La app está **funcional y probada de punta a punta** contra un proyecto real de Supabase.
Permite planificar las cenas de la semana según la dificultad del día, elegir platos del
recetario, generar la lista de compras, consultar el historial y funcionar como PWA instalable.

**Todos los usuarios necesitan una cuenta**: la app pide login siempre y los datos se
sincronizan en la nube. Sin credenciales de Supabase muestra una pantalla de configuración; el
modo local quedó **solo para los tests de Playwright**. Además, en nube hay **caché de lectura y
cola de escrituras** por hogar: sin conexión se ven los últimos datos y los cambios se
reintentan al volver la red.

El deploy está publicado en Vercel (**<https://comidas-pi.vercel.app>**) con las variables de
Supabase cargadas: la URL pública muestra el login y exige cuenta. Las **Redirect URLs de
Supabase ya están configuradas** (Site URL y allowlist) y el usuario verificó el flujo de
recuperación de contraseña y el login desde la URL pública.

**Hogares compartidos: implementado, aplicado y desplegado.** El tablero compartido, los
links de invitación y la UI de Ajustes están en producción; la migración SQL se ejecutó en
Supabase y se verificó de punta a punta con dos cuentas temporales. Queda que lo pruebes con tu
pareja en dos dispositivos.

## Qué está hecho

### Semana (pantalla principal)

- Navegación por semanas (lunes a domingo), con etiquetas “Esta semana / pasada / próxima”.
- Dificultad por día: Del freezer, Muy fácil, Fácil, Media, Elaborada.
- Sugerencias acordes a la dificultad, con opción de incluir platos más fáciles.
- “Sorpréndeme” por día y “Sorpréndeme” para completar toda la semana sin repetir platos.
- Cambiar dificultad conserva el plato si sigue siendo válido; si no, lo quita con aviso.
- Elegir plato, ver receta, pedir otra sugerencia o quitar el plato.
- **Nota por día:** texto libre (“sobró arroz, usarlo el jueves”) que se guarda con el día
  y no interviene en las sugerencias ni en la lista de compras.
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
- **Unidades compatibles:** suma y convierte masas (g/kg), volúmenes (ml/l/cda/cdta/taza) y
  unidades. “500 g + 1 kg” → “1.5 kg”; “200 ml + 1 cda” → “215 ml”; “3 cda + 2 cda” → “5 cda”.
- Unifica nombres de ingredientes sin distinguir mayúsculas, tildes ni espacios.
- **Ítems manuales editables:** se pueden cambiar el nombre, la cantidad y el **rubro**, o
  quitarlos de la lista. El nombre usa el mismo autocompletado del recetario (“eso” → “Queso”)
  y al agregar se puede elegir entre Automático y los cuatro rubros. Los ítems generados desde
  un plato no se editan a mano.
- Suma cantidades numéricas y conserva los tildados **y los ítems manuales** al regenerar.
- Ítems manuales, tildado persistente y acción de compartir/copiar.
- Aviso de lista desactualizada cuando se agrega un plato sin ítems.

### Historial

- Semanas con actividad, ordenadas de más reciente a más antigua.
- Detalle por día, “Ver semana” y “Copiar a esta semana”.

### Ajustes

- **Tema de la interfaz:** clásico (cálido), cool (azul) y oscuro, con vista previa.
  Se aplica al instante y queda guardado en este dispositivo.
- Cuenta y sesión (ingresar, crear cuenta, salir). **La cuenta es obligatoria** para usar la app.
- **Recuperación de contraseña:** “¿Olvidaste tu contraseña?” manda un link por email y abre una
  pantalla para elegir la nueva. También “Volver al ingreso” para descartar el cambio.
- **Eliminar la cuenta** (con doble confirmación): borra la cuenta de Supabase y,
  por las claves foráneas en cascada, todos sus platos, planes y compras.
- Instalar PWA (con instructivo para iOS).
- Exportar/importar backup JSON.
- Cargar los 20 platos de ejemplo.
- **Normalizar ingredientes:** unifica variantes ya guardadas (“queso” → “Queso”) y reasigna
  rubros viejos en todos los platos.
- Pasos para conectar Supabase.
- **Zona peligrosa:** eliminar la cuenta (doble confirmación), **salir del hogar** y borrar
  todos los datos.

### Hogar compartido (implementado, aplicado y desplegado)

- **Un hogar por usuario**, que comparte platos, semana, compras e historial. Todos los
  miembros pueden editar todo.
- **Ajustes → Hogar**: nombre editable, lista de miembros con email y rol, alta/copia/
  revocación de links de invitación y “Salir del hogar”.
- **Links de invitación** `#/unirse/<uuid>`: vencen a los 7 días, son revocables y reutilizables.
  Quien los abre inicia sesión o crea una cuenta y confirma la unión en `InviteScreen`.
- **Migración de datos**: `supabase/migration_hogares.sql` crea `households`,
  `household_members` y `household_invites`, agrega `household_id` a las tres tablas, migra las
  filas existentes sin perder nada y cambia el RLS a `is_household_member(household_id)`.
- **Salir del hogar**: vive en **Zona peligrosa** y solo se muestra cuando queda otro miembro.
  Si sos el único, la opción se oculta por completo (el hogar vacío se borraría con todos sus
  datos). La regla está en `canLeaveHousehold()` y tiene tests.
- **Borrado de cuenta**: si el hogar tiene otros miembros, los datos compartidos sobreviven;
  si era el último, el hogar y sus datos se eliminan.

### Base técnica

- Adaptador de datos abstracto con implementación de nube (Supabase) envuelta por un adaptador
  offline; el local (`localStorage`) queda solo para los tests de Playwright.
- **Caché de lectura por hogar** en `localStorage` (`comidas:cache:v1:<householdId>:dishes|plans|shopping`):
  si una lectura falla por red, se muestran los últimos datos guardados. Dos miembros del mismo
  hogar comparten ámbito; hogares distintos quedan aislados (`rescope` al unirse/salir).
- **Cola de escrituras por hogar** (`comidas:queue:v1:<householdId>`): las escrituras que fallan
  por red se guardan y se reintentan al volver la conexión o al abrir la app. La UI muestra
  “Sin conexión” y la cantidad de cambios pendientes, con un botón “Reintentar”.
- Los errores que no son de red (RLS, validación) no se encolan: se muestran y se descarta solo
  esa operación.
- **Cuenta obligatoria:** sin variables de Supabase la app muestra “Falta configurar Supabase”;
  `VITE_E2E_LOCAL=1` solo tiene efecto junto con `--mode e2e`.
- `supabase/schema.sql` (base) + `supabase/migration_hogares.sql` (hogares, RLS por membresía y
  `delete_my_account()` adaptado). El cliente resuelve el hogar con `my_household()` y guarda un
  fallback en `comidas:household:v1:<userId>` para arrancar offline.
- PWA con manifest, íconos, service worker y precache.
- **Tests con Vitest** para fechas, rubros, sugerencias, unidades de compras e ingredientes,
  más el modo de la app, el adaptador offline (ahora por hogar) y los links de invitación.
- **Tests de interfaz con Playwright** (6 flujos críticos).
- Repositorio git inicializado con historial (`main`).
- README en español con setup y deploy.
- Responsive mobile-first; sin desbordes horizontales a 390 px.

## Decisiones tomadas

| Decisión | Por qué |
| --- | --- |
| React + Vite + TypeScript | Stack simple, rápido y fácil de desplegar como sitio estático. |
| Tailwind v4 con tokens en `index.css` | Menos configuración y estilos consistentes con la identidad visual. |
| Cuenta obligatoria en Supabase | Los datos se sincronizan entre dispositivos y no quedan atados a un navegador; evita un modo local que confunda a usuarios reales. |
| Modo local solo en tests (`--mode e2e` + `VITE_E2E_LOCAL=1`) | Playwright necesita un backend efímero, pero una build de producción nunca debe poder saltearse el login. |
| `DataAdapter` | La UI no sabe si los datos son locales o remotos; se puede cambiar la persistencia. |
| Adaptador offline que envuelve al de nube | Mantiene la lógica de Supabase intacta: la caché y la cola son una capa aparte y testeable. |
| Caché y cola por **hogar** en `localStorage` | Dos miembros del mismo hogar ven la misma foto offline; hogares distintos siguen aislados. |
| Encolar solo errores de red | Un error de RLS o validación no se arregla reintentando; se muestra y se descarta esa operación. |
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
| Conversión de unidades al generar compras | Evita comprar de más: g/kg, ml/l y cucharadas se suman en una sola línea; las unidades libres (“puñado”, “lata”) se conservan tal cual. |
| Ítems manuales con `dishId: null` | Distingue lo que escribió el usuario de lo generado por una receta, para permitir editarlo/borrarlo y preservarlo al regenerar. |
| Nota del día como campo aparte | Sirve para recordatorios (“sobró arroz”) sin ensuciar el nombre del plato ni la lista de compras. |
| Tests con Vitest (sin navegador) | Cubren la lógica pura (fechas, sugerencias, unidades, ingredientes) y corren rápido; los flujos visuales se siguen probando a mano. |
| Recuperación detectada al inicio y guardada en `sessionStorage` | Supabase puede borrar el hash del link antes de que React monte; así la pantalla de contraseña nueva no se pierde. |
| **Un hogar por usuario, todo compartido** | Es el caso de una pareja que cocina las mismas cenas: platos, semana, compras e historial son un solo tablero. |
| **Links de invitación en el hash** (`#/unirse/<uuid>`) | No requieren SMTP ni Redirect URLs nuevas; el token se captura al arrancar y sobrevive al login como `comidas:invite`. |
| **RPC `security definer` para membresías** | Evita recursión de RLS sobre `household_members` y que un usuario se autoasigne a un hogar ajeno. |
| **`user_id` sin FK y nullable** | Borrar una cuenta no debe borrar por cascade los datos de un hogar compartido; queda solo como autoría. |
| **Migración de datos sin pérdida** | La cuenta principal ya tiene 21 platos, 7 planes y 32 compras: se asocian a un hogar nuevo en vez de empezar de cero. |
| **Ocultar “Salir” al único miembro** | La RPC borra el hogar vacío por cascade; perder todas las recetas por un botón de configuración es inaceptable. Se oculta la opción, sin texto explicativo que distraiga. |
| Temas con variables CSS y `data-theme` | Un solo juego de utilidades Tailwind: el tema cambia redeclarando variables, sin duplicar clases ni componentes. |
| Preferencia de tema por dispositivo | Es una decisión de pantalla, no un dato de la cuenta; no se sincroniza con Supabase. |

## Verificado hasta ahora

- `npm run build` compila sin errores (TypeScript + Vite + PWA).
- Build con service worker: 25 archivos precacheados.
- Modo local de test: persistencia tras recargar; alta de platos; dificultad; sugerencias.
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
- **Tests automatizados (15/11/2026):** `npm test` corre **44 tests en 8 archivos**:
  `date`, `constants`, `suggest`, `ingredients`, `appMode`, `offline`, `invite` y `household`.
  Cubren conversión de unidades, unificación de nombres, preservación de tildados/manuales,
  búsqueda tolerante a errores de tipeo, cuenta obligatoria/modo de test, caché de lectura, cola
  de escrituras por hogar (aislamiento, cola compartida y `rescope`), compactación, descarte de
  errores que no son de red, parseo/armado de links de invitación y la regla de salida del hogar.
- **Git (15/11/2026):** repositorio inicializado, `.gitignore` revisado y primer commit
  `c4ed472` con los 50 archivos de la primera versión. El remoto
  `git@github.com:moloyo/FoodOrganizer.git` estaba vacío; el 15/11 se publicó `main`.
- **Nota del día (15/11/2026):** probada en un build local (`dist-test`): se guarda, aparece en
  la tarjeta y sobrevive a la recarga.
- **Compras (15/11/2026):** probado en build local: un “Sorpréndeme” completo generó 26 ítems
  en Verdulería/Supermercado/Dietética; “Aceite de oliva · 260 ml”, “Salsa de soja · 3 cda” y
  “Perejil · 1 puñado” muestran la conversión y el respeto por unidades libres. Un ítem manual
  se creó, editó y conservó tras recargar y tras “Generar”; un ítem tildado siguió tildado.
- **Normalizar ingredientes (15/11/2026):** un plato con “tomate” en rubro “Frutas” quedó como
  “Tomate” en “Verdulería” después de la acción de Ajustes.
- **Recuperación de contraseña (15/11/2026):** en modo nube, “¿Olvidaste tu contraseña?” muestra
  solo el email y “Mandar link”; un link con `type=recovery` abre la pantalla de contraseña
  nueva incluso si el hash se limpia; “Volver al ingreso” descarta el cambio y limpia la marca.
- **Supabase de punta a punta (15/11/2026):** con una cuenta real se creó un plato, se planificó
  un día en la semana siguiente, se guardó una nota, se generó la lista (“Tomate · 2 u”) y se
  tildó un ítem. Tras recargar, plato, plan, nota y tildado seguían ahí.
- **RLS (15/11/2026):** la lectura anónima de `dishes`, `plans` y `shopping_items` devuelve `[]`.
  Con el JWT del usuario, las tres tablas devolvieron solo filas propias (0 ajenas) y un `insert`
  con `user_id` forjado fue rechazado con `403` / `42501`.
- **Datos de prueba:** se borraron el plato, el plan y la compra de prueba; la cuenta quedó con
  21 platos, 7 planes y 32 ítems, como estaba antes.
- **Carga inicial (15/11/2026):** se corrigió un destello del estado “Tu recetario está vacío”
  mientras llegaban los datos de la nube: ahora se muestra el splash hasta que termina la
  primera carga.
- **Tests de interfaz (15/11/2026):** `npm run test:e2e` corre **6 tests** de Playwright en Chrome
  sobre un Vite en modo local (puerto 5175): “Sorpréndeme” y persistencia, elección de plato por
  dificultad, alta de plato con “eso” → “Queso”, compras con tildado e ítem manual, **rubro y
  autocompletado del ítem manual**, y temas. El modo `e2e` usa `tests/e2e/env` como `envDir` y
  no toca el `.env.local` real.
- **Type-check + build (15/11/2026):** `npm run build` compila sin errores; el bundle principal
  queda en ~638 kB (aviso de tamaño, no bloqueante).
- **Cuenta obligatoria (15/11/2026):** sin credenciales de Supabase la app muestra “Falta
  configurar Supabase” (no hay modo local para usuarios). `resolveAppMode` solo acepta
  `e2e-local` con `--mode e2e` **y** `VITE_E2E_LOCAL=1`; los tests cubren los tres casos.
- **RLS con segunda cuenta (15/11/2026):** una cuenta temporal creada para la prueba vio solo su
  propio plato, la cuenta principal no lo vio, `delete_my_account` respondió 204, el token
  temporal dejó de servir (403) y los datos de la cuenta principal quedaron intactos.
- **Offline (15/11/2026):** los tests del adaptador cubren caché de platos/compras por semana,
  no inventar listas vacías, encolar planes, compactar escrituras repetidas, separar la cola por
  hogar, compartirla entre miembros, `rescope`, no encolar errores de RLS y cargar ejemplos sin
  red con ids UUID.
- **Hogares (15/11/2026):** la migración se aplicó en Supabase y el cliente se desplegó en
  Vercel. Verificación con dos cuentas temporales (sin tocar la cuenta principal):
  `my_household()` creó un hogar por cuenta; `household_invite_create/info/join` unieron a la
  segunda al hogar de la primera; un `insert` con `household_id` ajeno fue rechazado con `403`;
  el plato creado por A fue visible para B tras unirse; `household_members_list()` devolvió 2;
  `anon` siguió viendo `[]`. Al borrar la cuenta A con `delete_my_account()` los datos
  compartidos sobrevivieron para B; al borrar B el hogar vacío se limpió (204 en ambos casos).
  El bundle desplegado contiene las RPC nuevas y el login público no tiene errores de consola.
- **Pendiente:** prueba con la pareja en dos dispositivos (la cuenta principal no se tocó).

## Limitaciones conocidas

- **Falta la prueba con la pareja en dos dispositivos.** La verificación con dos cuentas
  temporales pasó por API; el flujo real (link → registro → unión → edición compartida) no se
  probó todavía con la cuenta principal.
- **Falta la prueba real de offline en el celular.** El adaptador offline está cubierto por tests
  y la UI muestra el estado de la cola, pero la prueba con la PWA instalada y modo avión
  no se hizo todavía.
- **El primer uso necesita conexión.** La caché offline se llena con la primera lectura; sin red
  y sin datos guardados, la app avisa que no hay datos.
- **La cola offline vive en el dispositivo.** Si se borran los datos del navegador antes de
  sincronizar, esos cambios pendientes se pierden. Tampoco hay resolución de conflictos: la
  última escritura que llega gana. Con dos personas editando la misma semana a la vez, un
  `replaceShopping` puede pisar la lista del otro.
- **No hay sincronización en tiempo real.** Otro dispositivo (o el de tu pareja) ve los cambios
  al recargar.
- **`household_join` mueve los datos del hogar origen.** Para una cuenta nueva es inocuo, pero
  si alguien con datos deja un hogar compartido uniéndose a otro, se lleva esos datos; “Salir del
  hogar” en cambio los deja.
- **No hay linter.** La lógica pura está cubierta con Vitest y los flujos críticos con
  Playwright; la PWA, el modo nube y los detalles visuales se siguen revisando a mano.
- **La lista no detecta cambios internos de una receta.** Solo marca “desactualizada” cuando
  hay un plato planificado sin ítems; hay que regenerarla a mano.
- **Cambiar un ítem generado desde una receta** obliga a editar el plato y regenerar; en la
  lista solo se editan/borran los ítems manuales.
- **Falta cambio de email** desde la app (la recuperación de contraseña y el borrado de cuenta
  ya están).
- **El borrado de cuenta necesita la migración aplicada.** Si el proyecto no tiene la versión
  nueva de `delete_my_account()`, la app muestra un aviso para ejecutar `migration_hogares.sql`.
- **Importar en nube borra todo antes de insertar y no es transaccional.**
- **La semana visible vuelve a la actual al recargar.** El plan y la lista se guardan, pero la
  navegación de semanas no se persiste.
- **La normalización de ingredientes es manual.** El autocompletado corrige al crear/editar y
  “Normalizar ingredientes” recorre todo el recetario, pero no se ejecuta sola.
- **El tema es por dispositivo.** No se guarda en la cuenta ni se sincroniza entre equipos.
- **El rubro es una sugerencia por nombre.** La autodetección cubre lo habitual, pero un
  ingrediente nuevo puede caer en “Otros”; se corrige a mano en el editor del plato.
- **Los rubros viejos se reescriben solo al normalizar.** Se muestran bien desde el primer
  momento, pero la base conserva el valor anterior hasta editar el plato, regenerar la lista
  o usar “Normalizar ingredientes”.
- **Recetas de ejemplo provisorias.** Sirven para probar, no son el recetario definitivo.
- **Sin escalado por comensales ni fotos.**

## Pendientes priorizados

### P0 · Antes de usar la app en serio

1. **Git local listo.** Repositorio inicializado, `.gitignore` y primer commit `c4ed472`.
   - [x] `git init` + commit inicial.
   - [x] Publicar el historial en el remoto (`git@github.com:moloyo/FoodOrganizer.git`);
     `main` quedó en `28e9505`.
2. **Terminar de probar Supabase de punta a punta** con el proyecto real:
   - [x] ejecutar `supabase/schema.sql`;
   - [x] cargar las variables en `.env.local`;
   - [x] registrar una cuenta y probar escrituras (crear plato, planificar, compras);
   - [x] registrar una segunda cuenta y verificar que cada una ve solo sus datos (RLS);
     - [x] lectura anónima vacía y rechazo de escritura con `user_id` ajeno;
     - [x] dos sesiones reales simultáneas (cuenta temporal; `delete_my_account` respondió 204);
   - [x] configurar el deploy en Vercel con las variables de Supabase;
   - [x] configurar Site URL y Redirect URLs (`comidas-pi.vercel.app/**` y `localhost:5173/**`);
   - [x] probar el login y la recuperación de contraseña desde la URL pública.
   - [x] volver a ejecutar `supabase/schema.sql` para habilitar `delete_my_account()`.
3. **Aplicar y probar hogares:**
   - [x] ejecutar `supabase/migration_hogares.sql` en el SQL Editor;
   - [x] confirmar que no quedaron filas sin `household_id` (aviso final del script);
   - [x] desplegar el cliente nuevo (`git push`, Vercel auto-deploy);
   - [x] verificar RLS con dos cuentas: cada una ve solo su hogar y un `insert` con
     `household_id` ajeno es rechazado (`403`);
   - [x] crear un link, unir a la segunda cuenta y comprobar que comparten tablero;
   - [x] probar borrado de cuenta con el hogar compartido (los datos sobreviven al otro miembro);
   - [ ] probar el flujo real con la pareja en dos dispositivos.
4. **Reemplazar los platos de ejemplo por recetas reales** (o crear las propias y borrar los ejemplos).

### P1 · Próximas mejoras

5. **Tests:** [x] Vitest para `date.ts`, `constants.ts`, `suggest.ts` e `ingredients.ts`
   (22 tests). [x] Vitest para el modo de la app, el adaptador offline y los links de
   invitación y la regla de salida (22 tests más; **44 en total**). [x] Playwright para los flujos críticos (**6 tests**).
6. **Compras:** [x] borrar y editar ítems manuales, [x] convertir unidades (g/kg, ml/l, cda/cdta,
   unidades), [x] unificar nombres al generar la lista y [x] rubro + autocompletado al agregar
   o editar ítems manuales.
7. **Cuenta:** [x] recuperación de contraseña, [x] borrado de cuenta, [x] cuenta obligatoria y
   [x] hogar compartido (migración aplicada y verificada).
8. **Nota del día:** [x] UI para editar y guardar la nota.
9. **Manejo offline en nube:** [x] caché de lectura por hogar, [x] cola de escrituras con
   reintento automático/manual y [x] aviso de estado en la interfaz.
10. **Normalizar ingredientes ya guardados:** [x] acción en Ajustes.
11. **Unificar nombres de ingredientes al generar la lista:** [x] incluido en `buildShoppingItems`.

### P2 · Ideas

12. Cantidad de comensales y escalado de ingredientes.
13. Fotos de platos.
14. “Ya lo cociné” para mejorar sugerencias con el historial.
15. Recordatorio semanal para planificar.
16. Sincronización en tiempo real entre miembros del hogar (Supabase Realtime).
17. Migraciones SQL versionadas (hoy el schema y la migración se corren a mano).
18. Atajos de PWA y tema automático según el sistema (`prefers-color-scheme`).
19. Cambio de email desde la app.
20. Marcar recetas que no se quieren volver a sugerir.

## Cómo retomar

1. Leer [`DESARROLLO.md`](DESARROLLO.md) (setup, arquitectura y convenciones).
2. `npm install` si hace falta y `npm run dev`.
3. Correr `npm test` para confirmar que la lógica sigue sana.
4. Revisar los pendientes P0 de arriba.
5. Antes de cerrar una sesión de trabajo: `npm test`, `npm run build`, actualizar la bitácora
   y, si se agregó una decisión importante, sumarla a la tabla de decisiones.

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

### 2026-11-15 · Tests, compras más inteligentes y cuenta

- **Tests:** se agregó Vitest (`vitest.config.ts`, scripts `test`/`test:watch`) con 22 tests
  en `tests/`: fechas y semanas, rubros y palabra clave más larga, sugerencias por dificultad,
  unificación/conversión de unidades, preservación de tildados y manuales, catálogo y búsqueda
  de ingredientes (incluido “eso” → “Queso”).
- **Compras:** `buildShoppingItems` ahora unifica nombres y unidades compatibles:
  - masa: 500 g + 1 kg → `1.5 kg`;
  - volumen: 200 ml + 1 cda → `215 ml`, 1 l + 500 ml → `1.5 l`;
  - cucharadas: 3 cda + 2 cda → `5 cda` (no pasa a ml);
  - unidades: 2 u + 1 unidad → `3 u`;
  - unidades libres (“puñado”, “lata”) se muestran con ` + `.
- **Ítems manuales:** se pueden editar (nombre + cantidad/detalle) y borrar desde la lista;
  los generados por receta no. `mergeShopping` conserva tildados **y** manuales al regenerar.
- **Nota del día:** botón en cada tarjeta, `Sheet` con textarea y guardado por `setDayNote`.
- **Normalizar ingredientes:** acción en Ajustes que reescribe nombres y rubros viejos en todos
  los platos; informa cuántos cambió.
- **Cuenta:** recuperación de contraseña (link + pantalla nueva) y eliminación de cuenta con
  doble confirmación. `supabase/schema.sql` incorpora `delete_my_account()`
  (`security definer`, borra `auth.users` y cae en cascada).
- **`recovery.ts`:** detecta `type=recovery` en el primer arranque y lo guarda en
  `sessionStorage`, porque Supabase puede limpiar el hash antes de montar React.
- **Git:** commit inicial `c4ed472`; se configuró el remoto `moloyo/FoodOrganizer`. La clave
  `~/.ssh/id_public` autentica como `moloyo` y `main` se publicó el 15/11 (`28e9505`).
- Verificación: `npm test` (22/22), `npm run build` correcto, y prueba manual en build local de
  nota, alta/edición/borrado de manuales, regeneración, normalización y recuperación.

### 2026-11-15 · Supabase real de punta a punta

- **Push:** `main` se publicó en `origin/main` (`28e9505`) con la clave `~/.ssh/id_public`.
- **Prueba con cuenta real:** se creó el plato “Plato de prueba E2E”, se planificó el lunes de la
  semana siguiente, se guardó la nota “Nota E2E nube”, se generó la compra (“Tomate · 2 u”) y se
  tildó. Tras recargar, todo seguía igual (plato, plan, nota y tildado).
- **RLS:** la lectura anónima devuelve `[]`; con el JWT del usuario, `dishes`, `plans` y
  `shopping_items` devolvieron 22/8/33 filas, todas propias (0 ajenas). Un `insert` con
  `user_id` ajeno fue rechazado con `403` y código `42501`.
- **Limpieza:** se borraron por id la fila de prueba de `plans`, la de `shopping_items` y el
  plato; la cuenta volvió a 21 platos, 7 planes y 32 ítems.
- **Carga inicial:** `AppContext` ahora expone `loaded` y `Gate` muestra el splash hasta que
  terminan de llegar platos y planes; se evita el falso “Tu recetario está vacío” al entrar.
- **Pendiente de P0.2:** segunda cuenta real, Redirect URLs del deploy y login en dos
  dispositivos.
- **Tests de interfaz:** se agregó Playwright (`playwright.config.ts`, `tests/e2e/`) con 5 tests
  sobre semana, plato, compras y temas. Corren con `npm run test:e2e` contra un Vite en
  `--mode e2e` (puerto 5175) que usa `tests/e2e/env` como `envDir` y arranca en modo local sin
  tocar el `.env.local`. Pasan los 5.

### 2026-11-15 · Cuenta obligatoria y modo offline

- **Cuenta obligatoria:** la app ya no ofrece un modo local para usuarios reales. Sin
  `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se muestra **“Falta configurar Supabase”**
  con los pasos de setup. El modo local quedó reservado a Playwright (`--mode e2e` **y**
  `VITE_E2E_LOCAL=1`); en producción esa variable se ignora.
- **Archivos nuevos:**
  - `src/lib/appMode.ts`: resuelve `cloud | e2e-local | unconfigured`.
  - `src/lib/adapters/offline.ts`: caché de lectura + cola de escrituras por usuario.
  - `src/lib/uuid.ts`: helpers `isUuid`/`newUuid` compartidos por los adaptadores.
  - `tests/appMode.test.ts` y `tests/offline.test.ts`.
- **Offline:** `createOfflineAdapter` envuelve al adaptador de Supabase. Cachea platos, planes y
  compras por semana en claves `comidas:cache:v1:<userId>:*`; encola en
  `comidas:queue:v1:<userId>` solo los errores de red. Al volver la conexión (o al abrir la
  app) se reintenta en orden, compactando escrituras repetidas del mismo día.
- **UI:** `Shell` muestra un aviso con el estado (“Sin conexión”, “Sincronizando” o cambios
  pendientes) y un botón “Reintentar”. Al terminar la cola se releen los datos del servidor.
- **Seguridad de la cola:** `replaceShopping` solo encola si esa semana ya estaba cacheada, para
  no pisar una lista que nunca se leyó; `seedDishes` offline normaliza ids a UUID y encola
  `saveDish`.
- **Segunda cuenta (RLS):** se creó una cuenta temporal, se verificó que solo veía su propio
  plato y que la cuenta principal no lo veía; `delete_my_account` respondió 204, el token
  temporal pasó a 403 y los datos principales quedaron intactos.
- **Verificación:** `npm test` 36/36, `npm run build` correcto y `npm run test:e2e` 5/5 (se
  ajustó el locator del ítem manual “Pan rallado” para evitar el modo estricto de Playwright).
- **Documentación:** README, `DESARROLLO.md`, `ESTADO.md` y `.env.example` actualizados para
  cuenta obligatoria, offline y modo local solo de test.

### 2026-11-15 · Deploy en Vercel

- **Proyecto:** `comidas` en Vercel (`joaquin-garcias-projects-08d21ff3`), conectado al repo
  `moloyo/FoodOrganizer`. `vercel.json` fija framework Vite, build `npm run build`, salida
  `dist` y `Cache-Control: no-cache` para `sw.js`.
- **Variables:** `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` cargadas en **Production** y
  **Preview** (nunca en el repo).
- **URL de producción:** <https://comidas-pi.vercel.app>.
- **Verificación:** en un contexto limpio de Chrome la URL pública muestra el login (no la
  pantalla de configuración ni datos locales), sin errores de consola; `sw.js` y el manifest
  responden 200.
- **URLs de Supabase (15/11/2026):** se configuraron **Site URL =
  `https://comidas-pi.vercel.app`** y Redirect URLs (`https://comidas-pi.vercel.app/**` y
  `http://localhost:5173/**`). El usuario verificó el link de recuperación y el login desde la
  URL pública. Un primer link cayó en un proyecto viejo (`food-organizer`) porque el Site URL
  apuntaba ahí; ese proyecto duplicado se eliminó y quedó `comidas` como único deploy.
- **Pendiente:** prueba real de offline en el celular con la PWA instalada.

### 2026-11-15 · Hogares compartidos (código listo, migración pendiente)

- **Decisión del usuario:** todo compartido (platos, semana, compras e historial), un hogar por
  usuario, link de invitación, todos editan todo y migrar los datos existentes sin pérdida.
- **Schema:** `supabase/migration_hogares.sql` (idempotente) crea `households`,
  `household_members` y `household_invites`, agrega `household_id` a las 3 tablas, hace backfill
  de las cuentas existentes, cambia el unique de `plans` y reemplaza las policies por
  `is_household_member(household_id)`. `user_id` queda nullable y sin FK para que borrar una
  cuenta no borre datos compartidos. `delete_my_account()` se reescribe para limpiar solo los
  hogares que quedan vacíos.
- **RPC nuevas:** `my_household`, `household_members_list`, `household_invite_create/list/revoke/info`,
  `household_join`, `household_leave`, `household_rename` (todas `security definer`).
- **Cliente:** `SessionUser` suma `householdId`; `DataAdapter` extiende `HouseholdAdapter`.
  `cloud.ts` resuelve el hogar al iniciar sesión (con fallback en `localStorage` para offline) y
  escribe/filtra por `household_id`. `offline.ts` cambia el ámbito de caché/cola al hogar, con
  `rescope` al unirse/salir. `local.ts` tiene stubs para que Playwright siga pasando.
- **UI:** `InviteScreen` (confirmación de unión), sección “Hogar” en Ajustes (nombre, miembros,
  links, salir), aviso de invitación pendiente en `AuthScreen`, y `Gate` que atiende
  `#/unirse/<token>` antes del tablero. `src/lib/invite.ts` captura el token en
  `sessionStorage`.
- **Tests:** se agregaron casos de cola por hogar (aislamiento, compartida y `rescope`) y
  `tests/invite.test.ts`. `npm test` 41/41, `npm run build` correcto, `npx tsc -b` sin errores y
  `npm run test:e2e` 5/5 (corrido 3 veces seguidas).
- **Deploy (15/11/2026):** migración aplicada en Supabase, `git push` a `main` (`5dfba8b`) y
  Vercel desplegó solo. El bundle público contiene `my_household`/`household_join` y el login
  no muestra errores de consola. Verificación con dos cuentas temporales detallada más arriba.
- **Corrección de test flaco:** `shopping.spec.ts` exigía ver siempre los cuatro rubros, pero
  “Sorpréndeme” es al azar y a veces no genera ítems de Dietética. Ahora valida que todos los
  encabezados pertenezcan a los cuatro rubros permitidos (normalizando mayúsculas del CSS).
- **Pendiente:** prueba del flujo real con la pareja en dos dispositivos.

### 2026-11-15 · Ocultar salida para hogar de un solo miembro

- **Problema detectado:** `household_leave()` borra el hogar cuando no quedan miembros y el
  cascade elimina platos, planes, compras e invitaciones. El texto de Ajustes decía que “los
  datos compartidos quedan en el hogar”, lo cual es falso para ese caso.
- **Decisión del usuario:** ocultar la opción, sin texto explicativo, y ubicarla en **Zona
  peligrosa** (sin cambiar SQL).
- **Implementación:** `src/lib/household.ts` con `canLeaveHousehold()` (`memberCount > 1`);
  la opción se omite por completo cuando la persona es la única y, cuando se muestra, es una
  fila más de Zona peligrosa. `handleLeaveHousehold()` conserva la guardia defensiva.
- **Tests:** `tests/household.test.ts` (3 casos). `npm test` pasa a **44/44**; README,
  `DESARROLLO.md` y este estado actualizados.
- **No se tocó la migración SQL:** el borrado de cuenta del último miembro sigue eliminando el
  hogar (intencional y documentado).

### 2026-11-15 · Rubro y autocompletado en ítems manuales de compras

- **Pedido:** al agregar un ítem a mano no se podía elegir el rubro y faltaba el
  autocompletado de ingredientes en esa sección.
- **Implementación:** `ShoppingScreen` usa `IngredientNameInput` (catálogo del recetario +
  lista base, nombre canónico al salir del campo) tanto en el formulario de alta como en el
  editor. Se agregó `CategorySelect` con opción **Automático** (deduce con `guessCategory`) y
  los cuatro rubros. `addShoppingItem(texto, rubro)` y
  `updateShoppingItem(id, texto, rubro)` ahora respetan el rubro elegido; el editor también
  permite cambiarlo. `IngredientNameInput` acepta `autoFocus` para el `Sheet`.
- **Tests:** nuevo caso E2E que escribe “eso”, elige la sugerencia de Queso, selecciona
  Dietética y verifica que el ítem quede en ese rubro. `npm run test:e2e` pasa a **6/6**
  (corrido 2 veces). Se ajustaron dos locadores del test de compras porque las `<option>` del
  selector también coincidían con `getByText(/^Verdulería$/)`.
- **Verificación:** `npx tsc -b` limpio, `npm test` 44/44, `npm run build` correcto.
