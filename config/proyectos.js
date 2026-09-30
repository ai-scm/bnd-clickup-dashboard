/* =============================================================================
 *  CONFIGURACIÓN DEL DASHBOARD
 * -----------------------------------------------------------------------------
 *  Este es el ÚNICO archivo que hay que tocar para:
 *    - elegir qué proyectos se pueden mostrar (sección `proyectos`),
 *    - definir el ciclo de vida (etapas / hitos / indicadores) de cada cliente
 *      (sección `ciclos`),
 *    - cambiar textos, colores, umbrales y estados reconocidos.
 *
 *  El proyecto que se muestra se elige así (el primero que aplique):
 *    1. `?proyecto=<clave>` en la URL (útil para embeber en ClickUp:
 *       una vista embebida por proyecto, mismo archivo).
 *    2. `proyectoPorDefecto`, más abajo.
 *  `?demo=1` en la URL muestra el proyecto con DATOS DE PRUEBA generados
 *  localmente (no llama a ClickUp ni necesita token).
 *
 *  El token de ClickUp NO va aquí: va en config/secretos.js (ver
 *  config/secretos.example.js).
 * ========================================================================== */
window.DASHBOARD_CONFIG = {

  proyectoPorDefecto: 'cju-p2616',

  general: {
    refrescoMinutos: 5,
    locale: 'es-CO',
    maxPaginasPorLista: 20,          // 100 tareas por página → ~2.000 tareas por lista
    logoEmpresa: 'assets/logo-blend.png',
    // Colores que se asignan, en orden, a cada grupo (categoría / fase).
    paleta: ['#053057', '#00A8A8', '#F59E0B', '#7C3AED', '#DB2777', '#16A34A', '#0EA5E9', '#B45309', '#475569', '#65A30D']
  },

  // Nombres de estado de ClickUp → 4 estados internos (sin distinguir
  // mayúsculas ni tildes). Lo que no esté aquí se trata como "pendiente",
  // salvo que ClickUp marque el estado como tipo cerrado/done.
  estadosClickUp: {
    done:    ['done', 'closed', 'complete', 'completado', 'cerrado', 'finalizado'],
    doing:   ['doing', 'in progress', 'active', 'en progreso', 'en curso'],
    blocked: ['blocked', 'bloqueado']
  },

  /* ---------------------------------------------------------------------------
   *  CICLOS DE VIDA
   *  Un ciclo describe cómo está armado cada ítem (HU / RQ) por dentro y cómo
   *  se calculan los indicadores. Varios proyectos pueden compartir un ciclo.
   *
   *  etapas[]            Subtareas directas del ítem, en orden. Se reconocen
   *                      por nombre (sin tildes/mayúsculas). `alias` admite
   *                      nombres alternativos. `contarMeses: true` muestra
   *                      meses (en vez de días) mientras la etapa está en curso.
   *  etapasNoReconocidas 'actividad' → las subtareas que no son etapa se
   *                      muestran como "otras actividades".
   *                      'etapa'     → se muestran como etapa al final.
   *  etapaActual         'masAvanzada' (la de mayor posición que no esté
   *                      pendiente) o 'primeraAbierta' (la primera en curso o
   *                      bloqueada).
   *  hitos[]             Opcional. Tareas dentro del contenedor cuyo nombre
   *                      coincide con `contenedorHitos` (regex).
   *  clasificacion[]     Estado global de cada ítem. Se evalúan EN ORDEN y
   *                      gana la primera regla que se cumpla. Condiciones
   *                      (dentro de un objeto se combinan con Y; una lista de
   *                      objetos se combina con O):
   *                        { estadoItem: 'done' }
   *                        { etapa: '<nombre>', estado: ['doing', ...] }
   *                        { hito:  '<nombre>', estado: 'done' }
   *                        { algunaEtapaIniciada: true }
   *                        'siempre'
   *                      `completa: true` marca los estados que cuentan como
   *                      avance en las barras de progreso.
   *  lineasDeTiempo[]    Ejes de meses con la fecha en que cada ítem cumplió
   *                      algo. Fuente: `etapa` (fecha 'inicio' | 'fin'),
   *                      `hito` o `estadoItem` (fecha de cierre de la tarea).
   *                      `respaldo` = otra fuente si la primera no tiene fecha.
   *  alertas             diasBloqueo: solo se listan bloqueos con al menos
   *                      estos días. diasEstancado: hitos en curso con más
   *                      días que esto se resaltan.
   * ------------------------------------------------------------------------ */
  ciclos: {

    // Convención observada en las listas de Coljuegos en ClickUp
    // (P2616 / P2019): Epic = categoría, User Story = HU, y dentro de cada
    // HU estas etapas. No hay contenedor de hitos.
    'coljuegos-hu': {
      etapas: [
        { nombre: 'Análisis y Levantamiento' },
        { nombre: 'Diseño y Preparación Técnica' },
        { nombre: 'Implementación y Despliegue' },
        { nombre: 'Pruebas y Validación' },
        { nombre: 'Documentación y Entrega' },
        { nombre: 'Paso a producción' }
      ],
      etapasNoReconocidas: 'actividad',
      etapaActual: 'masAvanzada',
      hitos: [],
      // PROPUESTA de clasificación a partir de las etapas: validar con el equipo.
      clasificacion: [
        { clave: 'finalizada', etiqueta: 'Finalizadas',            icono: '✅', color: '#053057', completa: true, si: { estadoItem: 'done' } },
        { clave: 'produccion', etiqueta: 'En paso a producción',   icono: '🚀', color: '#00A8A8', si: { etapa: 'Paso a producción', estado: ['doing', 'blocked', 'done'] } },
        { clave: 'validacion', etiqueta: 'En pruebas y entrega',   icono: '🧪', color: '#0EA5E9', si: [
            { etapa: 'Pruebas y Validación',    estado: ['doing', 'blocked', 'done'] },
            { etapa: 'Documentación y Entrega', estado: ['doing', 'blocked', 'done'] } ] },
        { clave: 'desarrollo', etiqueta: 'En análisis y desarrollo', icono: '🛠️', color: '#314550', si: { algunaEtapaIniciada: true } },
        { clave: 'backlog',    etiqueta: 'Sin iniciar',            icono: '📥', color: '#8A9096', si: 'siempre' }
      ],
      lineasDeTiempo: [
        { titulo: 'Pasos a producción finalizados', etapa: 'Paso a producción', estado: 'done', fecha: 'fin',
          color: '#053057', leyenda: 'Fin de la etapa «Paso a producción»',
          vacio: 'Todavía no hay historias con la etapa «Paso a producción» finalizada y con fechas.' },
        { titulo: 'Historias de usuario cerradas', estadoItem: 'done',
          color: '#00838A', leyenda: 'Fecha de cierre de la HU en ClickUp',
          vacio: 'Todavía no hay historias de usuario cerradas.' }
      ],
      alertas: { diasBloqueo: 0, diasEstancado: 30 }
    },

    // Ciclo del dashboard original de Metro de Medellín (7 etapas + 6 hitos).
    'metro-rq': {
      etapas: [
        { nombre: 'Definición de Requerimientos' },
        { nombre: 'Análisis y Diseño Técnico' },
        { nombre: 'Desarrollo de Solución' },
        { nombre: 'Entregables Documentales' },
        { nombre: 'Pruebas en ambiente Test' },
        { nombre: 'Paso a Producción' },
        { nombre: 'Estabilización e Inicio de Garantía', contarMeses: true }
      ],
      etapasNoReconocidas: 'etapa',
      etapaActual: 'masAvanzada',
      contenedorHitos: '^Hitos',
      hitos: [
        'Inicio desarrollo del requerimiento',
        'Bloqueo en el desarrollo escalado a MMN',
        'Finalización desarrollo del requerimiento',
        'Deploy en Producción',
        'Notificación y solicitud de revisión del requerimiento a MMN',
        'Inicio periodo de estabilización y garantía'
      ],
      clasificacion: [
        { clave: 'produccion', etiqueta: 'En Producción',                   icono: '🚀', color: '#00A8A8', completa: true, si: { hito: 'Deploy en Producción', estado: 'done' } },
        { clave: 'pendiente',  etiqueta: 'Pendientes de Paso a Producción', icono: '⏳', color: '#0B0D0E', completa: true, si: { hito: 'Finalización desarrollo del requerimiento', estado: 'done' } },
        { clave: 'desarrollo', etiqueta: 'En Desarrollo',                   icono: '🛠️', color: '#053057', si: { hito: 'Inicio desarrollo del requerimiento', estado: 'done' } },
        { clave: 'backlog',    etiqueta: 'Sin iniciar',                     icono: '📥', color: '#667684', si: 'siempre' }
      ],
      lineasDeTiempo: [
        { titulo: 'Línea de Tiempo de Producción — Deploys Realizados', hito: 'Deploy en Producción', estado: 'done',
          color: '#053057', leyenda: 'Desplegado a producción', vacio: 'Todavía no hay requerimientos desplegados a producción.' },
        { titulo: 'Línea de Tiempo de Estabilización y Garantía', hito: 'Inicio periodo de estabilización y garantía',
          respaldo: { hito: 'Deploy en Producción' },
          color: '#00838A', leyenda: 'Inicio de estabilización (o deploy)', vacio: 'Todavía no hay requerimientos con inicio de estabilización registrado.' }
      ],
      alertas: { diasBloqueo: 30, diasEstancado: 30 }
    }
  },

  /* ---------------------------------------------------------------------------
   *  PROYECTOS
   *  Cada entrada es un dashboard seleccionable. Campos:
   *    titulo / subtitulo       Textos de la cabecera.
   *    cliente                  nombre, sigla y logo (ruta en assets/ o null).
   *    fuente.listas            IDs de Listas de ClickUp (se unen todas).
   *    items                    Qué tarea es un ítem (HU / RQ):
   *                               tiposClickUp  IDs de tipo de tarea
   *                                             (1006 = "User Story" en el
   *                                             workspace de Blend).
   *                               patronNombre  regex; grupo 1 = número,
   *                                             grupo 2 = nombre sin código.
   *                               soloRaiz      solo tareas sin padre.
   *                               prefijo/digitos  cómo se muestra el código.
   *    grupos                   Cómo se agrupan los ítems en pestañas:
   *                               fuente: 'padre'  → tarea padre del ítem (Epic)
   *                                       'lista'  → Lista de ClickUp
   *                                       'campo'  → campo personalizado (`campo`)
   *                                       'rangos' → por número del ítem
   *                               orden    nombres en el orden deseado
   *                               incluir  si no está vacío, SOLO estos grupos
   *                               excluir  grupos a ocultar
   *                               alias    { 'Nombre largo': 'Nombre corto' }
   *    ciclo                    Clave de `ciclos` (o un objeto de ciclo).
   *    tema                     primario / acento de la cabecera.
   *    oculto                   true → no aparece en el selector de proyectos.
   * ------------------------------------------------------------------------ */
  proyectos: {

    'cju-p2616': {
      titulo: 'Juegos Localizados Fase IV',
      subtitulo: '[P2616] FIXED · Coljuegos · Historias de usuario',
      cliente: { nombre: 'Coljuegos', sigla: 'CJU', logo: null },
      fuente: { listas: ['901713294194'] },
      items: {
        singular: 'Historia de usuario', plural: 'Historias de usuario', corto: 'HU',
        tiposClickUp: [1006],
        patronNombre: '^HU\\s*-?\\s*(\\d+)\\s*[-.:]?\\s*(.*)$',
        prefijo: 'HU', digitos: 3
      },
      grupos: { singular: 'Categoría', plural: 'Categorías', fuente: 'padre', orden: [], incluir: [], excluir: [], alias: {} },
      ciclo: 'coljuegos-hu',
      tema: { primario: '#053057', acento: '#00EDED' }
    },

    'cju-p2019': {
      titulo: 'Localizados +',
      subtitulo: '[P2019] FIXED · Coljuegos · Historias de usuario',
      cliente: { nombre: 'Coljuegos', sigla: 'CJU', logo: null },
      fuente: { listas: ['901707823343'] },
      items: {
        singular: 'Historia de usuario', plural: 'Historias de usuario', corto: 'HU',
        tiposClickUp: [1006],
        patronNombre: '^HU\\s*-?\\s*(\\d+)\\s*[-.:]?\\s*(.*)$',
        prefijo: 'HU', digitos: 3
      },
      grupos: { singular: 'Categoría', plural: 'Categorías', fuente: 'padre', orden: [], incluir: [], excluir: [], alias: {} },
      ciclo: 'coljuegos-hu',
      tema: { primario: '#053057', acento: '#00EDED' }
    },

    'cnjsa-p2620': {
      titulo: 'Secretaria Tecnica Renovacion',
      subtitulo: '[P2620] - FIXED - Secretaria Tecnica Renovacion Fixed',
      cliente: { nombre: 'Coljuegos', sigla: 'CJU', logo: null },
      fuente: { listas: ['901711341902'] },
      items: {
        singular: 'Historia de usuario', plural: 'Historias de usuario', corto: 'HU',
        tiposClickUp: [1006],
        patronNombre: '^HU\\s*-?\\s*(\\d+)\\s*[-.:]?\\s*(.*)$',
        prefijo: 'HU', digitos: 3
      },
      grupos: { singular: 'Categoría', plural: 'Categorías', fuente: 'padre', orden: [], incluir: [], excluir: [], alias: {} },
      ciclo: 'coljuegos-hu',
      tema: { primario: '#053057', acento: '#00EDED' }
    }
  }
};
