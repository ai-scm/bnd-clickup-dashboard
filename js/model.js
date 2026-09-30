/* =============================================================================
 *  MODELO DE DATOS
 *  Configuración + tareas crudas de ClickUp  →  { grupos, items }
 *  No toca el DOM: se puede probar con Node (ver README).
 * ========================================================================== */
(function (global) {
  'use strict';

  const Dash = global.Dash = global.Dash || {};

  // ---------------------------------------------------------------- utilidades

  function norm(s) {
    return (s == null ? '' : String(s))
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function toArray(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }

  function toMs(v) {
    if (v == null || v === '') return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }

  const DAY_MS = 24 * 60 * 60 * 1000;

  function daysSince(ms) {
    return ms ? Math.floor((Date.now() - ms) / DAY_MS) : null;
  }

  function monthsSince(ms) {
    if (!ms) return null;
    const start = new Date(ms);
    const now = new Date();
    let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) months--;
    return Math.max(0, months);
  }

  // Iniciales de un nombre de grupo, para desambiguar códigos repetidos
  // (en Coljuegos la numeración HU se reinicia en cada categoría).
  const STOP_WORDS = new Set(['y', 'e', 'de', 'del', 'la', 'las', 'el', 'los', 'a', 'en', 'para', 'por', 'con']);
  function initials(name) {
    return norm(name).replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(' ')
      .filter(w => w && !STOP_WORDS.has(w)).slice(0, 3)
      .map(w => w[0].toUpperCase()).join('') || '?';
  }

  // ------------------------------------------------------------- configuración

  // Selección del proyecto: ?proyecto=<clave> > forzado en build > por defecto.
  function selectProjectKey(config, search) {
    const params = new URLSearchParams(search || '');
    return global.DASHBOARD_FORZAR_PROYECTO || params.get('proyecto') || config.proyectoPorDefecto;
  }

  // Devuelve el proyecto con todos los valores por defecto aplicados, para
  // que el resto del código nunca tenga que preguntar "¿y si no viene?".
  function resolveProject(config, key) {
    const raw = config.proyectos && config.proyectos[key];
    if (!raw) throw new Error('No existe el proyecto «' + key + '» en config/proyectos.js');
    const ciclo = typeof raw.ciclo === 'string' ? (config.ciclos || {})[raw.ciclo] : raw.ciclo;
    if (!ciclo) throw new Error('El proyecto «' + key + '» usa un ciclo que no existe: ' + raw.ciclo);

    const general = Object.assign({ refrescoMinutos: 5, locale: 'es-CO', maxPaginasPorLista: 20, paleta: ['#053057'] }, config.general);
    return Object.assign({}, raw, {
      clave: key,
      general: general,
      cliente: Object.assign({ nombre: '', sigla: '', logo: null }, raw.cliente),
      fuente: Object.assign({ listas: [] }, raw.fuente),
      tema: Object.assign({ primario: '#053057', acento: '#00EDED' }, raw.tema),
      items: Object.assign({
        singular: 'Ítem', plural: 'Ítems', corto: '', tiposClickUp: [], patronNombre: null,
        soloRaiz: false, prefijo: '', digitos: 2
      }, raw.items),
      grupos: Object.assign({
        singular: 'Grupo', plural: 'Grupos', fuente: 'padre', orden: [], incluir: [], excluir: [],
        alias: {}, sinGrupo: 'Sin agrupar', colores: null
      }, raw.grupos),
      ciclo: Object.assign({
        etapas: [], etapasNoReconocidas: 'actividad', etapaActual: 'masAvanzada',
        contenedorHitos: '^Hitos', hitos: [], clasificacion: [], lineasDeTiempo: []
      }, ciclo, {
        alertas: Object.assign({ diasBloqueo: 0, diasEstancado: 30 }, ciclo.alertas)
      })
    });
  }

  function makeStatusNormalizer(estadosClickUp) {
    const lookup = {};
    ['done', 'doing', 'blocked'].forEach(k => {
      toArray((estadosClickUp || {})[k]).forEach(name => { lookup[norm(name)] = k; });
    });
    return function statusOf(task) {
      const st = task && task.status;
      const name = norm(st && typeof st === 'object' ? st.status : st);
      if (lookup[name]) return lookup[name];
      if (st && (st.type === 'closed' || st.type === 'done')) return 'done';
      return 'backlog';
    };
  }

  // ------------------------------------------------------------------- ClickUp

  async function fetchList(listId, token, maxPages) {
    let all = [];
    for (let page = 0; page < maxPages; page++) {
      const url = 'https://api.clickup.com/api/v2/list/' + encodeURIComponent(listId) +
        '/task?subtasks=true&include_closed=true&page=' + page;
      const resp = await fetch(url, { headers: { Authorization: token } });
      if (!resp.ok) throw new Error('ClickUp API ' + resp.status + ' (lista ' + listId + '): ' + await resp.text());
      const data = await resp.json();
      const tasks = data.tasks || [];
      all = all.concat(tasks);
      if (data.last_page === true || tasks.length < 100) break;
    }
    return all;
  }

  async function fetchProjectTasks(project, token) {
    const seen = new Set();
    const out = [];
    for (const listId of project.fuente.listas) {
      const tasks = await fetchList(listId, token, project.general.maxPaginasPorLista);
      tasks.forEach(t => { if (!seen.has(t.id)) { seen.add(t.id); out.push(t); } });
    }
    return out;
  }

  // ------------------------------------------------------------ construcción

  function buildModel(tasks, project, statusOf) {
    const cfgItems = project.items;
    const cfgGroups = project.grupos;
    const ciclo = project.ciclo;

    const byId = new Map(tasks.map(t => [t.id, t]));
    const childrenOf = new Map();
    tasks.forEach(t => {
      if (!t.parent) return;
      if (!childrenOf.has(t.parent)) childrenOf.set(t.parent, []);
      childrenOf.get(t.parent).push(t);
    });
    const byCreated = (a, b) => (toMs(a.date_created) || 0) - (toMs(b.date_created) || 0);
    const kids = id => (childrenOf.get(id) || []).slice().sort(byCreated);

    function descendants(id) {
      const out = [];
      const stack = kids(id);
      while (stack.length) {
        const t = stack.shift();
        out.push(t);
        stack.push.apply(stack, kids(t.id));
      }
      return out;
    }

    // Rango de fechas de una etapa: no tiene fecha propia, se deduce del
    // inicio más temprano y la fecha límite más tardía de sus actividades.
    function dateRange(list) {
      let start = null, end = null;
      list.forEach(t => {
        const s = toMs(t.start_date) || toMs(t.due_date);
        const e = toMs(t.due_date) || toMs(t.start_date);
        if (s !== null && (start === null || s < start)) start = s;
        if (e !== null && (end === null || e > end)) end = e;
      });
      if (start === null) start = end;
      if (end === null) end = start;
      if (start !== null && end < start) { const tmp = start; start = end; end = tmp; }
      return { start: start, end: end };
    }

    // 1) ¿Qué tareas son ítems (HU / RQ)?
    const nameRe = cfgItems.patronNombre ? new RegExp(cfgItems.patronNombre, 'i') : null;
    const typeIds = new Set(toArray(cfgItems.tiposClickUp).map(Number));
    const isCandidate = t =>
      !(cfgItems.soloRaiz && t.parent) &&
      ((typeIds.size > 0 && typeIds.has(Number(t.custom_item_id))) || !!(nameRe && nameRe.test(t.name || '')));
    const candidates = new Set(tasks.filter(isCandidate).map(t => t.id));
    // Un ítem dentro de otro ítem no cuenta (sería una actividad con nombre parecido).
    const hasCandidateAncestor = t => {
      for (let p = byId.get(t.parent); p; p = byId.get(p.parent)) if (candidates.has(p.id)) return true;
      return false;
    };
    const itemTasks = tasks.filter(t => candidates.has(t.id) && !hasCandidateAncestor(t));

    // 2) Etapas, hitos y actividades de cada ítem.
    const stageDefs = ciclo.etapas.map((e, i) => {
      const def = typeof e === 'string' ? { nombre: e } : e;
      return Object.assign({ index: i, keys: [def.nombre].concat(toArray(def.alias)).map(norm) }, def);
    });
    const findStageDef = name => stageDefs.find(d => d.keys.indexOf(norm(name)) !== -1) || null;
    const milestoneNames = toArray(ciclo.hitos).map(h => typeof h === 'string' ? h : h.nombre);
    const containerRe = new RegExp(ciclo.contenedorHitos || '^Hitos', 'i');
    const codePrefixRe = new RegExp('^' + (cfgItems.prefijo || '') + '\\d+\\.?\\s*', 'i');

    function toStage(t, def) {
      const desc = descendants(t.id);
      const range = dateRange(desc);
      return {
        name: def ? def.nombre : (t.name || '').replace(codePrefixRe, ''),
        order: def ? def.index : 1000,
        known: !!def,
        countMonths: !!(def && def.contarMeses),
        status: statusOf(t),
        start: range.start,
        end: range.end,
        url: t.url,
        blockedItems: desc.filter(d => statusOf(d) === 'blocked').map(d => d.name)
      };
    }

    function buildItem(t) {
      // El patrón puede usar grupos posicionales (1 = número, 2 = nombre) o
      // con nombre: (?<num>…), (?<nombre>…) y opcionalmente (?<hasta>…) para
      // tareas que agrupan un rango de ítems («HU02 - HU06 - …»).
      const m = nameRe ? (t.name || '').match(nameRe) : null;
      const g = m ? (m.groups || { num: m[1], nombre: m[2] }) : {};
      const fmt = n => (cfgItems.prefijo || '') + String(n).padStart(cfgItems.digitos, '0');
      const num = g.num ? parseInt(g.num, 10) : null;
      const until = g.hasta ? parseInt(g.hasta, 10) : null;
      const code = num === null ? '' : fmt(num) + (until !== null ? '–' + fmt(until) : '');
      const name = m ? (g.nombre || '').trim() || t.name : t.name;

      const directKids = kids(t.id);
      const container = milestoneNames.length ? directKids.find(k => containerRe.test(k.name || '')) : null;
      const stages = [];
      const activities = [];
      directKids.forEach(k => {
        if (container && k.id === container.id) return;
        // Tareas de tipo personalizado (p. ej. Milestone) no son etapas.
        const plainTask = !k.custom_item_id || k.custom_item_id === 0;
        const def = plainTask ? findStageDef(k.name) : null;
        if (def) stages.push(toStage(k, def));
        else if (plainTask && ciclo.etapasNoReconocidas === 'etapa') stages.push(toStage(k, null));
        else activities.push({ name: k.name, status: statusOf(k), url: k.url, blockedItems: descendants(k.id).filter(d => statusOf(d) === 'blocked').map(d => d.name) });
      });
      stages.sort((a, b) => a.order - b.order);

      const milestoneTasks = container ? kids(container.id) : [];
      const toMilestone = mt => ({
        name: mt.name,
        status: statusOf(mt),
        date: toMs(mt.start_date) || toMs(mt.due_date),
        url: mt.url
      });
      const milestones = milestoneNames.map(name => {
        const found = milestoneTasks.find(mt => norm(mt.name) === norm(name));
        if (!found) return { name: name, status: 'backlog', date: null, missing: true, subs: [] };
        return Object.assign(toMilestone(found), { name: name, subs: kids(found.id).map(toMilestone) });
      });

      return {
        id: t.id,
        num: num,
        code: code,
        name: name,
        url: t.url,
        status: statusOf(t),
        closedDate: toMs(t.date_done) || toMs(t.date_closed),
        updated: toMs(t.date_updated),
        stages: stages,
        activities: activities,
        milestones: milestones,
        task: t
      };
    }

    const items = itemTasks.map(buildItem);

    // 3) Grupo de cada ítem.
    function groupOf(item) {
      const t = item.task;
      switch (cfgGroups.fuente) {
        case 'padre': {
          const p = byId.get(t.parent);
          return p ? { key: p.id, name: p.name, sort: toMs(p.date_created) || 0 } : null;
        }
        case 'lista':
          return t.list ? { key: 'list-' + t.list.id, name: t.list.name, sort: 0 } : null;
        case 'campo': {
          const f = (t.custom_fields || []).find(cf => norm(cf.name) === norm(cfgGroups.campo));
          if (!f || f.value == null || f.value === '') return null;
          const opts = (f.type_config && f.type_config.options) || [];
          const v = Array.isArray(f.value) ? f.value[0] : f.value;
          const opt = opts.find(o => o.id === v || o.orderindex === Number(v));
          const label = opt ? (opt.name || opt.label) : String(v);
          return { key: 'cf-' + norm(label), name: label, sort: opt ? opt.orderindex : 0 };
        }
        case 'rangos': {
          const exc = (cfgGroups.excepciones || {})[item.num];
          const r = exc ? { grupo: exc } : toArray(cfgGroups.rangos).find(x => x.hasta == null || (item.num !== null && item.num <= x.hasta));
          return r ? { key: 'r-' + norm(r.grupo), name: r.grupo, sort: 0 } : null;
        }
        default:
          throw new Error('grupos.fuente desconocida: ' + cfgGroups.fuente);
      }
    }

    const include = toArray(cfgGroups.incluir).map(norm);
    const exclude = toArray(cfgGroups.excluir).map(norm);
    const orderList = toArray(cfgGroups.orden).map(norm);
    const aliasByNorm = {};
    Object.keys(cfgGroups.alias || {}).forEach(k => { aliasByNorm[norm(k)] = cfgGroups.alias[k]; });

    const groupsByKey = new Map();
    items.forEach(item => {
      const g = groupOf(item) || { key: '__none__', name: cfgGroups.sinGrupo, sort: Number.MAX_SAFE_INTEGER };
      const n = norm(g.name);
      if ((include.length && include.indexOf(n) === -1) || exclude.indexOf(n) !== -1) return;
      if (!groupsByKey.has(g.key)) {
        groupsByKey.set(g.key, {
          key: g.key, name: g.name, label: aliasByNorm[n] || g.name,
          initials: initials(aliasByNorm[n] || g.name), sort: g.sort, items: []
        });
      }
      item.groupKey = g.key;
      groupsByKey.get(g.key).items.push(item);
    });

    const rank = g => { const i = orderList.indexOf(norm(g.name)); return i === -1 ? orderList.length : i; };
    const groups = Array.from(groupsByKey.values())
      .sort((a, b) => rank(a) - rank(b) || a.sort - b.sort || a.name.localeCompare(b.name));
    const palette = cfgGroups.colores || project.general.paleta;
    const usedInitials = {};
    groups.forEach((g, i) => {
      g.color = palette[i % palette.length];
      const base = g.initials;
      for (let k = 2; usedInitials[g.initials]; k++) g.initials = base + k;
      usedInitials[g.initials] = true;
      g.items.sort((a, b) => (a.num === null) - (b.num === null) || (a.num || 0) - (b.num || 0) || a.name.localeCompare(b.name));
    });

    // Si el mismo código aparece en varios grupos, la etiqueta corta lleva
    // las iniciales del grupo (p. ej. «RND·HU001»).
    const codeGroups = {};
    items.forEach(it => { if (it.code && it.groupKey) (codeGroups[it.code] = codeGroups[it.code] || new Set()).add(it.groupKey); });
    const visibleItems = [];
    groups.forEach(g => g.items.forEach(it => {
      it.group = g;
      const ambiguous = it.code && codeGroups[it.code].size > 1;
      it.shortLabel = it.code
        ? (ambiguous ? g.initials + '·' + it.code : it.code)
        : g.initials + '·' + (cfgItems.corto ? cfgItems.corto + ' s/c' : 's/c');
      it.fullLabel = (it.code ? it.code + ' · ' : '') + it.name;
      it.currentStage = currentStage(it, ciclo.etapaActual);
      it.state = classify(it, ciclo.clasificacion);
      visibleItems.push(it);
    }));

    return { groups: groups, items: visibleItems };
  }

  // ------------------------------------------------------------ reglas

  function currentStage(item, rule) {
    const stages = item.stages.filter(s => s.known);
    if (rule === 'primeraAbierta') {
      return stages.find(s => s.status === 'doing' || s.status === 'blocked') ||
        stages.slice().reverse().find(s => s.status === 'done') || null;
    }
    return stages.slice().reverse().find(s => s.status !== 'backlog') || null;
  }

  function matches(item, cond) {
    if (cond === 'siempre') return true;
    if (Array.isArray(cond)) return cond.some(c => matches(item, c));
    if (!cond || typeof cond !== 'object') return false;
    const wanted = toArray(cond.estado);
    const okStatus = s => !wanted.length || wanted.indexOf(s) !== -1;

    if ('estadoItem' in cond && toArray(cond.estadoItem).indexOf(item.status) === -1) return false;
    if ('etapa' in cond) {
      const s = item.stages.find(x => norm(x.name) === norm(cond.etapa));
      if (!s || !okStatus(s.status)) return false;
    }
    if ('hito' in cond) {
      const m = item.milestones.find(x => norm(x.name) === norm(cond.hito));
      if (!m || m.missing || !okStatus(m.status)) return false;
    }
    if (cond.algunaEtapaIniciada &&
        !item.stages.some(s => s.status !== 'backlog') &&
        !item.activities.some(a => a.status !== 'backlog')) return false;
    return true;
  }

  function classify(item, rules) {
    return rules.find(r => matches(item, r.si)) || null;
  }

  // Fecha de un ítem para una línea de tiempo (o null si no aplica).
  function timelineDate(item, src) {
    if (!src) return null;
    const wanted = toArray(src.estado);
    const okStatus = s => !wanted.length || wanted.indexOf(s) !== -1;
    let date = null;
    if (src.etapa) {
      const s = item.stages.find(x => norm(x.name) === norm(src.etapa));
      if (s && okStatus(s.status)) date = src.fecha === 'inicio' ? s.start : s.end;
    } else if (src.hito) {
      const m = item.milestones.find(x => norm(x.name) === norm(src.hito));
      if (m && !m.missing && okStatus(m.status)) date = m.date;
    } else if (src.estadoItem) {
      if (toArray(src.estadoItem).indexOf(item.status) !== -1) date = item.closedDate || item.updated;
    }
    return date || timelineDate(item, src.respaldo);
  }

  // Todo lo que está bloqueado dentro de un ítem, con los días de referencia.
  // `date` es la mejor referencia disponible: ClickUp no expone "desde
  // cuándo" está bloqueado algo sin una llamada extra por tarea.
  function blockedEntries(item) {
    const out = [];
    if (item.status === 'blocked') out.push({ what: 'Bloqueado', date: item.updated, dateKind: 'actualizado' });
    item.stages.forEach(s => {
      if (s.status === 'blocked') out.push({ what: 'Etapa «' + s.name + '» bloqueada', date: s.start, dateKind: 'inicio' });
      s.blockedItems.forEach(n => out.push({ what: s.name + ' → ' + n, date: s.start, dateKind: 'inicio' }));
    });
    item.activities.forEach(a => {
      if (a.status === 'blocked') out.push({ what: 'Actividad «' + a.name + '» bloqueada', date: null });
      a.blockedItems.forEach(n => out.push({ what: a.name + ' → ' + n, date: null }));
    });
    item.milestones.forEach(m => {
      if (m.status === 'blocked') out.push({ what: 'Hito «' + m.name + '»', date: m.date, dateKind: 'hito' });
    });
    return out;
  }

  Dash.util = { norm: norm, toArray: toArray, daysSince: daysSince, monthsSince: monthsSince, initials: initials };
  Dash.model = {
    selectProjectKey: selectProjectKey,
    resolveProject: resolveProject,
    makeStatusNormalizer: makeStatusNormalizer,
    fetchProjectTasks: fetchProjectTasks,
    buildModel: buildModel,
    timelineDate: timelineDate,
    blockedEntries: blockedEntries
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Dash;
})(typeof window !== 'undefined' ? window : globalThis);
