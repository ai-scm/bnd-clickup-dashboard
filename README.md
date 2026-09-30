# Dashboard de estado de proyecto (ClickUp)

Evolución del dashboard de Metro de Medellín (`plantilla/`). Ahora es **un solo motor configurable** que sirve para cualquier proyecto:

- **Coljuegos**: *Categoría → Historias de usuario → Etapas*.
- **Metro de Medellín**: *Fase → Requerimientos → Etapas + Hitos*.

Sigue sin servidor ni base de datos: el navegador consulta la API de ClickUp y arma la vista. Cambia la forma de trabajar: lo que antes estaba quemado en el HTML ahora vive en **`config/proyectos.js`**.

```
clickupDashboard/
├── index.html              estructura de la página
├── config/
│   ├── proyectos.js        ← LO ÚNICO QUE SE EDITA: proyectos, ciclos, textos, colores, umbrales
│   ├── secretos.example.js plantilla del token
│   └── secretos.js         tu token (NO se versiona, está en .gitignore)
├── css/dashboard.css
├── js/model.js             ClickUp → { grupos, ítems }  (sin DOM)
├── js/app.js               pintado, pestañas, líneas de tiempo, PDF
├── js/demo-data.js         datos de PRUEBA para ?demo=1
├── assets/                 logos
├── build.py                empaqueta todo en un único .html
└── plantilla/              dashboard original de Metro (referencia; el token va como marcador)
```

## Uso rápido

1. Copia `config/secretos.example.js` como `config/secretos.js` y pega tu token (`pk_...`).
2. Abre `index.html` en el navegador.
   - `?proyecto=cju-p2019` → otro proyecto de los configurados.
   - `?vista=<clave>` → abre directamente una pestaña (se actualiza sola al navegar).
   - `?expandir=1` → todas las tarjetas abiertas.
   - `?demo=1` → **datos de prueba** generados localmente (no necesita token; todo aparece marcado «PRUEBA»).
3. Para entregar un solo archivo (como el original), por ejemplo para embeberlo en ClickUp:
   ```bash
   python3 build.py --proyecto cju-p2616 --con-token   # → dist/dashboard-cju-p2616.html
   ```
   Sin `--proyecto` se muestra un selector con todos los proyectos no ocultos. Sin `--con-token` el archivo no lleva el token.

## Cómo se interpreta ClickUp en Coljuegos

Esta es la convención que tienen hoy las listas P2616 y P2019:

```
Reglas de negocio, Datos y Optimización        ← Epic sin padre      = CATEGORÍA (pestaña)
├── HU001 - Traslado de tabla de fabricantes…   ← User Story (1006)   = HISTORIA DE USUARIO
│   ├── Análisis y Levantamiento                ← etapa (tarea normal)
│   │     └── actividades con fechas            ← definen las fechas de la etapa
│   ├── Diseño y Preparación Técnica
│   ├── Implementación y Despliegue
│   ├── Pruebas y Validación
│   ├── Documentación y Entrega
│   ├── Paso a producción                       (no todas las HU la tienen)
│   └── Refactor …                              ← subtarea que no es etapa = "otra actividad"
└── Alertas por valor de cartón…                ← User Story sin código: se muestra como «sin código»
```

- **Ítem**: tarea de tipo *User Story* (`tiposClickUp: [1006]`) **o** con nombre `HU###`. El número y el nombre salen de `patronNombre`.
- **Categoría**: la tarea padre de la HU (`grupos.fuente: 'padre'`). Otras opciones: `'lista'`, `'campo'` (campo personalizado) o `'rangos'` (por número, como las fases del Metro).
- **La numeración HU se reinicia en cada categoría.** Cuando un código se repite, la etiqueta corta lleva las iniciales de la categoría (`RND·HU001`).
- **No hay hitos.** Los indicadores se calculan con las etapas (ver `clasificacion`).

## Qué se configura y dónde (`config/proyectos.js`)

| Qué quieres hacer | Dónde |
|---|---|
| Añadir o quitar un proyecto del selector | `proyectos` (u `oculto: true`) |
| Proyecto que abre por defecto | `proyectoPorDefecto` |
| Unir varias Listas en un dashboard | `proyectos.<clave>.fuente.listas` |
| Mostrar solo algunas categorías, ordenarlas o acortar su nombre | `grupos.incluir`, `grupos.excluir`, `grupos.orden`, `grupos.alias` |
| Nombres y orden de las etapas | `ciclos.<ciclo>.etapas` |
| Tarjetas de la vista General y cuándo un ítem cuenta como «completo» | `ciclos.<ciclo>.clasificacion` |
| Líneas de tiempo | `ciclos.<ciclo>.lineasDeTiempo` |
| Umbrales de alerta (días) | `ciclos.<ciclo>.alertas` |
| Estados de ClickUp reconocidos | `estadosClickUp` |
| Textos (HU / RQ, Categoría / Fase), logos y colores | `items`, `grupos`, `cliente`, `tema`, `general.paleta` |
| Intervalo de refresco | `general.refrescoMinutos` |

Para un cliente nuevo normalmente basta con copiar un bloque de `proyectos` y, si su ciclo de vida es distinto, un bloque de `ciclos`. No hace falta tocar JS.

## Qué muestra

**General**
- Una tarjeta por cada estado de `clasificacion` (con los chips de cada ítem; clic en un chip lleva a su tarjeta) y el total.
- **Avance por categoría**: barra apilada por estado y porcentaje completo.
- **Tablero de etapas**: cada ítem aparece en las columnas de las etapas en curso o bloqueadas, con los días que lleva en ellas (rojo si supera `diasEstancado`).
- **Líneas de tiempo** configurables (en Coljuegos: fin de «Paso a producción» y cierre de la HU).
- **Bloqueos**: ítems, etapas, actividades o hitos en estado bloqueado.

**Pestaña por categoría**: buscador, expandir/colapsar todo y una tarjeta por HU con su progreso, la etapa actual, el estado, el flujo de etapas (fechas, días, sub-tareas bloqueadas), otras actividades y los hitos si el ciclo los tiene. Cada tarjeta enlaza a ClickUp (↗).

## Cambios respecto al HTML de Metro

- Configuración centralizada: ya no hay que buscar y reemplazar nombres de etapas o hitos, rangos de fase, umbrales ni prefijos dentro del código.
- Pestañas dinámicas (una por categoría o fase encontrada), en lugar de las tres fases fijas.
- Varios proyectos en el mismo código, con selector o `?proyecto=`.
- Indicadores definidos como reglas, calculados con etapas o con hitos.
- Una sola función de línea de tiempo en lugar de dos copias casi iguales.
- Los nombres de tareas se escapan antes de insertarlos en el HTML (antes, un `<` en ClickUp rompía la vista).
- Hitos y etapas se reconocen sin distinguir tildes ni mayúsculas, y admiten `alias`.
- Estados de tipo «cerrado» en ClickUp cuentan como finalizados aunque tengan un nombre no listado.
- Enlaces a ClickUp, buscador, expandir/colapsar todo, enlaces profundos (`?vista=`) y modo demo.
- El token queda fuera del código (`secretos.js`, en `.gitignore`).

## Pendiente de validar con el equipo

- `ciclos['coljuegos-hu'].clasificacion` es una **propuesta**: define qué significa «en desarrollo», «en pruebas», etc. a partir de las etapas.
- Días de bloqueo: ClickUp no dice desde cuándo algo está bloqueado sin llamadas extra. Se usa la fecha de inicio de la etapa o la última actualización del ítem, según el caso.
- La «etapa actual» usa `masAvanzada`, igual que en el Metro. En Coljuegos es habitual que varias etapas estén en curso a la vez; `primeraAbierta` es la alternativa. La barra `n/m` de la tarjeta muestra el avance real.

## Probar el modelo sin navegador

```bash
node -e "
globalThis.window = globalThis;
require('./config/proyectos.js');
const D = require('./js/model.js'); require('./js/demo-data.js');
const p = D.model.resolveProject(DASHBOARD_CONFIG, 'cju-p2616');
const m = D.model.buildModel(D.demoTasks(p), p, D.model.makeStatusNormalizer(DASHBOARD_CONFIG.estadosClickUp));
m.items.forEach(i => console.log(i.shortLabel, i.state.clave, i.currentStage && i.currentStage.name));
"
```

## Seguridad

Igual que en el original: el token viaja en texto plano dentro del HTML y tiene los permisos de su dueño. Comparte los archivos generados con `--con-token` solo por canales privados, usa un usuario con acceso limitado y, si se filtra, regenera el token.
