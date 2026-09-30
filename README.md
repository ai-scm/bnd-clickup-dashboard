# ClickUp Dashboard

Dashboard de estado de proyecto construido sobre la API de ClickUp. Es un motor **configurable y sin backend**: el navegador consulta ClickUp y arma la vista a partir de un único archivo de configuración, así que se puede reutilizar en cualquier equipo sin tocar el código.

- Sin servidor ni base de datos: HTML + CSS + JavaScript plano.
- Varios proyectos en el mismo código, con selector o parámetro en la URL.
- Estructura de trabajo configurable: agrupación (categorías, fases…), ítems (historias de usuario, requerimientos…), etapas e hitos.
- Indicadores, líneas de tiempo y alertas definidos como reglas.
- Se puede empaquetar en un único `.html` para embeberlo, por ejemplo, en una vista de ClickUp.

## Requisitos

- Un navegador moderno.
- Un token personal de ClickUp (`pk_...`) con acceso a las listas que quieras mostrar.
- Python 3 (solo para `build.py`) y Node.js (opcional, solo para probar el modelo).

## Inicio rápido

1. Clona el repositorio.
2. Copia `config/secretos.example.js` como `config/secretos.js` y pega tu token
   (ClickUp → foto de perfil → Configuración → Apps → API Token).
3. Edita `config/proyectos.js`: define tus proyectos y los IDs de sus listas (ver [Configuración](#configuración)).
4. Abre `index.html` en el navegador.

Parámetros de URL:

| Parámetro | Efecto |
|---|---|
| `?proyecto=<clave>` | Muestra otro de los proyectos configurados. |
| `?vista=<clave>` | Abre directamente una pestaña. |
| `?expandir=1` | Todas las tarjetas abiertas. |
| `?demo=1` | Datos de prueba generados localmente (no necesita token; todo aparece marcado «PRUEBA»). |

Para probar sin conectar nada, abre `index.html?demo=1`.

## Estructura del proyecto

```
├── index.html               estructura de la página
├── config/
│   ├── proyectos.js         ← lo único que se edita: proyectos, ciclos, textos, colores, umbrales
│   ├── secretos.example.js  plantilla del token
│   └── secretos.js          tu token (no se versiona, está en .gitignore)
├── css/dashboard.css
├── js/model.js              ClickUp → { grupos, ítems } (sin DOM)
├── js/app.js                pintado, pestañas, líneas de tiempo, PDF
├── js/demo-data.js          datos de prueba para ?demo=1
├── assets/                  logos
├── build.py                 empaqueta todo en un único .html
└── plantilla/               versión original de un solo archivo (referencia)
```

## Configuración

Todo vive en `config/proyectos.js`, que tiene tres bloques principales:

- **`proyectos`**: cada entrada es un dashboard seleccionable. Indica las listas de ClickUp (`fuente.listas`), qué tarea cuenta como ítem (`items`), cómo se agrupan (`grupos`) y qué ciclo usan (`ciclo`).
- **`ciclos`**: describe cómo está armado cada ítem por dentro (etapas, hitos opcionales) y cómo se calculan los indicadores, las líneas de tiempo y las alertas. Varios proyectos pueden compartir un ciclo.
- **`general`, `estadosClickUp`**: refresco, paleta de colores y el mapeo de los nombres de estado de ClickUp a los estados internos (`done`, `doing`, `blocked`, pendiente).

| Qué quieres hacer | Dónde |
|---|---|
| Añadir o quitar un proyecto del selector | `proyectos` (o `oculto: true`) |
| Proyecto que abre por defecto | `proyectoPorDefecto` |
| Unir varias listas en un dashboard | `proyectos.<clave>.fuente.listas` |
| Definir qué tarea es un ítem | `proyectos.<clave>.items` (`tiposClickUp`, `patronNombre`, `soloRaiz`) |
| Mostrar solo algunos grupos, ordenarlos o acortar su nombre | `grupos.incluir`, `grupos.excluir`, `grupos.orden`, `grupos.alias` |
| Nombres y orden de las etapas | `ciclos.<ciclo>.etapas` |
| Tarjetas de la vista General y cuándo un ítem cuenta como «completo» | `ciclos.<ciclo>.clasificacion` |
| Líneas de tiempo | `ciclos.<ciclo>.lineasDeTiempo` |
| Umbrales de alerta (días) | `ciclos.<ciclo>.alertas` |
| Estados de ClickUp reconocidos | `estadosClickUp` |
| Textos, logos y colores | `items`, `grupos`, `cliente`, `tema`, `general.paleta` |
| Intervalo de refresco | `general.refrescoMinutos` |

El archivo está comentado campo por campo. Para sumar un equipo nuevo normalmente basta con copiar un bloque de `proyectos` y, si su ciclo de vida es distinto, un bloque de `ciclos`.

### Cómo se interpreta la estructura de ClickUp

El dashboard espera una jerarquía como esta (los nombres son configurables):

```
Grupo (tarea padre, lista, campo personalizado o rango)   ← una pestaña por grupo
├── Ítem (historia de usuario, requerimiento…)            ← una tarjeta
│   ├── Etapa 1                                           ← subtarea, en el orden del ciclo
│   │     └── actividades con fechas                      ← definen las fechas de la etapa
│   ├── Etapa 2
│   └── Otra subtarea                                     ← se muestra como «otra actividad»
└── …
```

- **Ítem**: se identifica por tipo de tarea de ClickUp (`tiposClickUp`), por nombre (`patronNombre`, una expresión regular cuyo grupo 1 es el número y el grupo 2 el nombre) o por ambos.
- **Grupo**: `grupos.fuente` admite `'padre'` (tarea padre del ítem), `'lista'`, `'campo'` (campo personalizado) y `'rangos'` (por número del ítem).
- **Etapas**: subtareas directas del ítem, reconocidas por nombre sin distinguir tildes ni mayúsculas (admiten `alias`).
- **Hitos**: opcionales; son tareas dentro de un contenedor cuyo nombre coincide con `contenedorHitos`.
- **Clasificación**: lista de reglas evaluadas en orden; gana la primera que se cumple. Puede basarse en el estado del ítem, en una etapa, en un hito o en si alguna etapa se inició.

## Qué muestra

**General**
- Una tarjeta por cada estado de `clasificacion`, con los chips de cada ítem, y el total.
- Avance por grupo: barra apilada por estado y porcentaje completo.
- Tablero de etapas: cada ítem aparece en las columnas de las etapas en curso o bloqueadas, con los días que lleva en ellas.
- Líneas de tiempo configurables.
- Bloqueos: ítems, etapas, actividades o hitos en estado bloqueado.

**Pestaña por grupo**: buscador, expandir/colapsar todo y una tarjeta por ítem con su progreso, etapa actual, estado, flujo de etapas (fechas, días, subtareas bloqueadas), otras actividades y los hitos si el ciclo los tiene. Cada tarjeta enlaza a ClickUp.

## Generar un único HTML

```bash
python3 build.py                                    # todos los proyectos, sin token
python3 build.py --proyecto mi-proyecto             # fija el proyecto (oculta el selector)
python3 build.py --proyecto mi-proyecto --con-token # incluye config/secretos.js
```

La salida queda en `dist/` (ignorado por git). Sin `--proyecto` el archivo muestra un selector con todos los proyectos no ocultos. Sin `--con-token` no incluye el token. `build.py` solo usa la librería estándar de Python.

## Probar el modelo sin navegador

```bash
node -e "
globalThis.window = globalThis;
require('./config/proyectos.js');
const D = require('./js/model.js'); require('./js/demo-data.js');
const p = D.model.resolveProject(DASHBOARD_CONFIG, DASHBOARD_CONFIG.proyectoPorDefecto);
const m = D.model.buildModel(D.demoTasks(p), p, D.model.makeStatusNormalizer(DASHBOARD_CONFIG.estadosClickUp));
m.items.forEach(i => console.log(i.shortLabel, i.state.clave, i.currentStage && i.currentStage.name));
"
```

## Limitaciones conocidas

- ClickUp no indica desde cuándo algo está bloqueado sin llamadas adicionales; los días de bloqueo se calculan con la fecha de inicio de la etapa o la última actualización del ítem.
- La «etapa actual» usa por defecto `masAvanzada`. Si en tu flujo suelen estar varias etapas en curso a la vez, `primeraAbierta` puede representarlo mejor; la barra `n/m` de la tarjeta muestra el avance real.
- Se consultan hasta `general.maxPaginasPorLista` páginas de 100 tareas por lista.

## Seguridad

El token de ClickUp viaja en texto plano dentro del HTML y tiene los permisos de su dueño.

- No subas `config/secretos.js` ni los archivos de `dist/` generados con `--con-token`.
- Comparte esos archivos solo por canales privados.
- Usa un usuario con acceso limitado a lo necesario.
- Si el token se filtra, regéneralo en ClickUp.

## Contribuir

1. Crea una rama a partir de `main`.
2. Mantén la lógica de negocio en la configuración y no en el código.
3. Abre un pull request describiendo el cambio.
