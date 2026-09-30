/* =============================================================================
 *  INTERFAZ
 *  Pinta el modelo (js/model.js) según la configuración del proyecto.
 *  Vistas: «General» + una pestaña por grupo (categoría / fase).
 * ========================================================================== */
(function () {
  'use strict';

  const { util, model } = window.Dash;
  const { norm, daysSince, monthsSince } = util;
  const CONFIG = window.DASHBOARD_CONFIG;
  const SECRETS = window.DASHBOARD_SECRETOS || {};
  const params = new URLSearchParams(location.search);
  const DEMO = params.get('demo') === '1';

  const state = {
    project: null,
    statusOf: null,
    data: { groups: [], items: [] },
    view: params.get('vista') || 'general',
    expanded: new Set(),
    filter: '',
    loaded: false
  };

  const $ = id => document.getElementById(id);

  // ------------------------------------------------------------ utilidades UI

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const locale = () => state.project.general.locale;
  function fmtDate(ms, short) {
    if (!ms) return null;
    return new Date(ms).toLocaleDateString(locale(), short
      ? { day: '2-digit', month: 'short' }
      : { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  // Oscurece (f < 0) o aclara (f > 0) un color hex.
  function shade(hex, f) {
    const n = parseInt(hex.replace('#', ''), 16);
    const ch = s => { const c = (n >> s) & 255; return Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f); };
    return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
  }

  function itemTitle(it) {
    return it.fullLabel + ' — ' + it.group.name + (it.state ? ' — ' + it.state.etiqueta : '');
  }

  function itemChip(it, opts) {
    opts = opts || {};
    const style = opts.solid ? ` style="background:${it.group.color}"` : '';
    const dot = opts.solid ? '' : `<span class="chip-dot" style="background:${it.group.color}"></span>`;
    return `<span class="chip${opts.solid ? ' solid' : ''}${opts.cls ? ' ' + opts.cls : ''}"${style} data-goto="${esc(it.id)}" title="${esc(opts.title || itemTitle(it))}">${dot}${esc(it.shortLabel)}</span>`;
  }

  // ------------------------------------------------------------ arranque

  function init() {
    let key;
    try {
      if (!CONFIG) throw new Error('No se cargó config/proyectos.js');
      key = model.selectProjectKey(CONFIG, location.search);
      state.project = model.resolveProject(CONFIG, key);
    } catch (err) {
      showBanner('config', '⚠️ ' + esc(err.message));
      return;
    }
    state.statusOf = model.makeStatusNormalizer(CONFIG.estadosClickUp);
    applyTheme();
    renderHeader();

    if (DEMO) {
      showBanner('demo', '🧪 <b>MODO DEMO — DATOS DE PRUEBA.</b> Esta vista usa información ficticia generada localmente; no refleja el estado real del proyecto. Quita <code>?demo=1</code> de la URL para ver los datos de ClickUp.');
    } else if (!token()) {
      showBanner('config', '⚠️ Falta el token de ClickUp. Copia <code>config/secretos.example.js</code> como <code>config/secretos.js</code> y pega tu token personal (ClickUp → foto de perfil → Configuración → Apps → API Token). Para ver la estructura sin token agrega <code>?demo=1</code> a la URL.');
      return;
    }

    bindEvents();
    loadData();
    if (!DEMO) setInterval(loadData, state.project.general.refrescoMinutos * 60 * 1000);
  }

  function token() {
    const perProject = (SECRETS.tokensPorProyecto || {})[state.project.clave];
    const t = perProject || SECRETS.clickupToken || '';
    return t && t.indexOf('PEGA_AQUI') === -1 ? t : null;
  }

  function applyTheme() {
    const p = state.project;
    const root = document.documentElement.style;
    root.setProperty('--primary', p.tema.primario);
    root.setProperty('--primary-dark', shade(p.tema.primario, -0.4));
    root.setProperty('--accent', p.tema.acento);
    document.title = (DEMO ? '[DEMO] ' : '') + p.titulo + ' — Estado del proyecto';
  }

  function renderHeader() {
    const p = state.project;
    const companyLogo = CONFIG.general && CONFIG.general.logoEmpresa;
    const clientMark = p.cliente.logo
      ? `<img class="logo-img logo-client" src="${esc(p.cliente.logo)}" alt="${esc(p.cliente.nombre)}">`
      : `<span class="client-badge" title="${esc(p.cliente.nombre)}">${esc(p.cliente.sigla || p.cliente.nombre)}</span>`;
    $('logoPair').innerHTML =
      (companyLogo ? `<img class="logo-img logo-blend" src="${esc(companyLogo)}" alt="">` : '') + clientMark;
    $('title').textContent = (DEMO ? '[DEMO] ' : '') + p.titulo;
    $('subtitle').textContent = p.subtitulo || '';

    const options = Object.keys(CONFIG.proyectos)
      .filter(k => k === p.clave || !CONFIG.proyectos[k].oculto);
    const sel = $('projectSelect');
    if (window.DASHBOARD_FORZAR_PROYECTO || options.length < 2) {
      sel.style.display = 'none';
    } else {
      sel.innerHTML = options.map(k =>
        `<option value="${esc(k)}"${k === p.clave ? ' selected' : ''}>${esc(CONFIG.proyectos[k].titulo)}</option>`).join('');
    }
  }

  function showBanner(kind, html) {
    const el = $('banner-' + kind);
    el.innerHTML = html;
    el.classList.add('show');
  }
  function hideBanner(kind) { $('banner-' + kind).classList.remove('show'); }

  function setSync(kind, label) {
    $('syncDot').className = 'sync-dot' + (kind === 'ok' ? '' : ' ' + kind);
    $('syncText').textContent = label;
  }

  async function loadData() {
    $('refreshBtn').disabled = true;
    hideBanner('error');
    if (!state.loaded) showBanner('loading', 'Cargando datos desde ClickUp…');
    setSync('loading', 'Sincronizando…');
    try {
      const tasks = DEMO ? window.Dash.demoTasks(state.project) : await model.fetchProjectTasks(state.project, token());
      state.data = model.buildModel(tasks, state.project, state.statusOf);
      if (!state.loaded && params.get('expandir') === '1') state.data.items.forEach(it => state.expanded.add(it.id));
      state.loaded = true;
      if (state.view !== 'general' && !findGroup(state.view)) state.view = 'general';
      render();
      setSync('ok', (DEMO ? 'Demo · ' : 'Actualizado ') +
        new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setSync('error', 'Error de sincronización');
      showBanner('error', 'No se pudo actualizar desde ClickUp: ' + esc(err.message) +
        (state.loaded ? '. Se muestran los últimos datos disponibles.' : ''));
    } finally {
      hideBanner('loading');
      $('refreshBtn').disabled = false;
    }
  }

  // ------------------------------------------------------------ navegación

  const findGroup = key => state.data.groups.find(g => g.key === key);
  const findItem = id => state.data.items.find(i => i.id === id);

  function setView(view) {
    state.view = view;
    state.filter = '';
    const url = new URL(location.href);
    if (view === 'general') url.searchParams.delete('vista'); else url.searchParams.set('vista', view);
    history.replaceState(null, '', url);
    render();
  }

  function gotoItem(id) {
    const it = findItem(id);
    if (!it) return;
    state.expanded.add(it.id);
    setView(it.group.key);
    const card = document.getElementById('card-' + it.id);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindEvents() {
    document.addEventListener('click', e => {
      const tab = e.target.closest('.tab-btn');
      if (tab) return setView(tab.dataset.view);
      const go = e.target.closest('[data-goto]');
      if (go) { e.preventDefault(); return gotoItem(go.dataset.goto); }
      const grp = e.target.closest('[data-group]');
      if (grp) return setView(grp.dataset.group);
      if (e.target.closest('a')) return;
      const header = e.target.closest('.item-header');
      if (header) {
        const card = header.parentElement;
        card.classList.toggle('collapsed');
        const id = card.dataset.id;
        if (card.classList.contains('collapsed')) state.expanded.delete(id); else state.expanded.add(id);
      }
    });
    $('refreshBtn').addEventListener('click', loadData);
    $('exportPdfBtn').addEventListener('click', exportPdf);
    $('projectSelect').addEventListener('change', e => {
      const url = new URL(location.href);
      url.searchParams.set('proyecto', e.target.value);
      url.searchParams.delete('vista');
      location.href = url.toString();
    });
  }

  // ------------------------------------------------------------ render

  function render() {
    renderTabs();
    if (state.view === 'general') renderGeneral();
    else renderGroup(findGroup(state.view));
  }

  function renderTabs() {
    const p = state.project;
    const tab = (view, label, count, color, title) =>
      `<button class="tab-btn${state.view === view ? ' active' : ''}" data-view="${esc(view)}" style="--tab-color:${color}" title="${esc(title || label)}">` +
      (view === 'general' ? '' : '<span class="tab-swatch"></span>') +
      `<span class="tab-label">${esc(label)}</span><span class="tab-count">${count}</span></button>`;
    $('tabs').innerHTML =
      tab('general', 'General', state.data.items.length, '#1A1A1A', 'Resumen de todas las ' + p.items.plural.toLowerCase()) +
      state.data.groups.map(g => tab(g.key, g.label, g.items.length, g.color, p.grupos.singular + ': ' + g.name)).join('');
  }

  // ---------------------------------------------------------- vista general

  function renderGeneral() {
    const p = state.project;
    const items = state.data.items;
    const view = $('view');
    if (!items.length) {
      view.innerHTML = `<div class="cards-empty">No se encontraron ${esc(p.items.plural.toLowerCase())} en ClickUp con la configuración actual.<br><small>Revisa <code>items</code> y <code>fuente.listas</code> del proyecto en config/proyectos.js.</small></div>`;
      return;
    }
    view.innerHTML =
      kpiCards() +
      panel(`Avance por ${p.grupos.singular.toLowerCase()}`, progressByGroup(), 'Clic en un nombre para ver sus ' + p.items.corto) +
      panel(`Tablero — ${p.items.plural} con etapas en curso`, stageBoard(), 'Número = días en la etapa') +
      p.ciclo.lineasDeTiempo.map(tl => panel(tl.titulo, timeline(tl))).join('') +
      panel(blockedTitle(), blockedList());
  }

  function panel(title, body, hint) {
    return `<div class="panel"><div class="section-label">${esc(title)}${hint ? `<span class="section-hint">${esc(hint)}</span>` : ''}</div>${body}</div>`;
  }

  const MAX_CHIPS = 40;
  function chipList(list) {
    if (!list.length) return `<div class="kpi-empty">— Ninguna todavía —</div>`;
    const extra = list.length > MAX_CHIPS ? `<span class="chip" title="Ver las pestañas de cada ${esc(state.project.grupos.singular.toLowerCase())}">+${list.length - MAX_CHIPS}</span>` : '';
    return `<div class="kpi-chips">${list.slice(0, MAX_CHIPS).map(it => itemChip(it)).join('')}${extra}</div>`;
  }

  function kpiCards() {
    const p = state.project;
    const items = state.data.items;
    const cards = p.ciclo.clasificacion.map(rule => {
      const list = items.filter(it => it.state && it.state.clave === rule.clave);
      const color = rule.color || '#314550';
      return `<div class="kpi" style="--kpi:${color};--kpi-2:${shade(color, -0.35)}">
        <div class="kpi-icon">${esc(rule.icono || '')}</div>
        <div class="kpi-label">${esc(rule.etiqueta)}</div>
        <div class="kpi-value">${list.length}</div>
        ${chipList(list)}
      </div>`;
    });
    cards.push(`<div class="kpi" style="--kpi:#314550;--kpi-2:#1A1A1A">
      <div class="kpi-icon">📋</div>
      <div class="kpi-label">Total ${esc(p.items.plural)}</div>
      <div class="kpi-value">${items.length}</div>
      <div class="kpi-sub">en ${plural(state.data.groups.length, p.grupos.singular.toLowerCase(), p.grupos.plural.toLowerCase())}</div>
    </div>`);
    return `<div class="kpi-grid">${cards.join('')}</div>`;
  }

  function progressByGroup() {
    const rules = state.project.ciclo.clasificacion;
    const rows = state.data.groups.map(g => {
      const total = g.items.length;
      const complete = g.items.filter(it => it.state && it.state.completa).length;
      const pct = total ? Math.round(complete / total * 100) : 0;
      const segs = rules.map(r => {
        const n = g.items.filter(it => it.state && it.state.clave === r.clave).length;
        return n ? `<div class="progress-seg" style="width:${n / total * 100}%;background:${r.color}" title="${esc(r.etiqueta)}: ${n}"></div>` : '';
      }).join('');
      return `<div class="progress-row">
        <div class="progress-top">
          <span class="progress-label" data-group="${esc(g.key)}"><span class="swatch" style="background:${g.color}"></span>${esc(g.label)}</span>
          <span class="progress-count">${complete}/${total} completas · ${pct}%</span>
        </div>
        <div class="progress-track">${segs}</div>
      </div>`;
    }).join('');
    const legend = rules.map(r => `<span class="legend-item"><span class="swatch" style="background:${r.color}"></span>${esc(r.etiqueta)}${r.completa ? ' ✓' : ''}</span>`).join('');
    return rows + `<div class="progress-legend">${legend}<span class="legend-item" style="margin-left:auto">✓ = cuenta como completa</span></div>`;
  }

  // Un ítem aparece en TODAS las columnas cuya etapa esté en curso o bloqueada:
  // así se ve de inmediato si tiene varias etapas activas en paralelo.
  function stageBoard() {
    const p = state.project;
    const cols = p.ciclo.etapas.map(e => typeof e === 'string' ? { nombre: e } : e);
    let idle = 0;
    const buckets = cols.map(() => []);
    state.data.items.forEach(it => {
      let any = false;
      cols.forEach((c, ci) => {
        const s = it.stages.find(x => norm(x.name) === norm(c.nombre));
        if (s && (s.status === 'doing' || s.status === 'blocked')) { buckets[ci].push({ it, s }); any = true; }
      });
      if (!any) idle++;
    });

    const html = cols.map((c, ci) => {
      const chips = buckets[ci].map(({ it, s }) => {
        const blocked = s.status === 'blocked' ? ' chip-blocked' : '';
        if (s.countMonths) {
          const m = monthsSince(s.start);
          const lbl = m === null ? '' : plural(m, 'mes', 'meses');
          return `<div class="chip-wrap">${itemChip(it, { solid: true, cls: blocked, title: itemTitle(it) + (lbl ? ' — lleva ' + lbl : '') })}${lbl ? `<span class="chip-months">${lbl}</span>` : ''}</div>`;
        }
        const d = daysSince(s.start);
        const badge = d === null ? '' : `<span class="chip-days${d > p.ciclo.alertas.diasEstancado ? '' : ' calm'}" title="${plural(d, 'día', 'días')} desde el inicio de la etapa">${d}</span>`;
        return `<div class="chip-wrap">${itemChip(it, { solid: true, cls: blocked, title: itemTitle(it) + (d !== null ? ' — ' + plural(d, 'día', 'días') + ' en la etapa' : '') + (blocked ? ' — BLOQUEADA' : '') })}${badge}</div>`;
      }).join('');
      return `<div class="board-col">
        <div class="board-col-header"><span>${esc(c.nombre)}</span><span class="board-col-count">${buckets[ci].length}</span></div>
        <div class="board-col-body">${chips || '<div class="board-empty">—</div>'}</div>
      </div>`;
    }).join('');

    const legend = state.data.groups.map(g => `<span class="legend-item"><span class="swatch" style="background:${g.color}"></span>${esc(g.label)}</span>`).join('');
    const note = idle ? `<span class="legend-item">⚪ ${plural(idle, p.items.corto || 'ítem', p.items.corto || 'ítems')} sin etapas en curso ahora</span>` : '';
    const days = `<span class="legend-item"><span class="swatch" style="background:var(--danger)"></span>más de ${p.ciclo.alertas.diasEstancado} días en la etapa</span>`;
    return `<div class="board">${html}</div><div class="progress-legend">${legend}${days}${note}</div>`;
  }

  // Línea de tiempo mensual. Las etiquetas cercanas se escalonan en altura
  // para no superponerse.
  function timeline(tl) {
    const entries = state.data.items
      .map(it => ({ it, date: model.timelineDate(it, tl) }))
      .filter(e => e.date)
      .sort((a, b) => a.date - b.date);
    if (!entries.length) return `<div class="empty-note neutral">${esc(tl.vacio || 'Sin datos todavía.')}</div>`;

    const now = Date.now();
    const minD = new Date(entries[0].date);
    const maxD = new Date(Math.max(now, entries[entries.length - 1].date));
    const startMonth = new Date(minD.getFullYear(), minD.getMonth() - 1, 1);
    const endMonth = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 1);
    const months = [];
    for (const c = new Date(startMonth); c <= endMonth; c.setMonth(c.getMonth() + 1)) months.push(new Date(c));

    const LEFT = 20, MONTH_W = 90, LINE_Y = 90, STEM = 26, STEP = 24, MIN_GAP = 38, MAX_LEVEL = 4;
    const width = LEFT + months.length * MONTH_W + 20;
    const xFor = ts => {
      const d = new Date(ts);
      const mi = (d.getFullYear() - startMonth.getFullYear()) * 12 + (d.getMonth() - startMonth.getMonth());
      const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return LEFT + (mi + (d.getDate() - 1) / dim) * MONTH_W;
    };

    const last = { up: null, down: null }, level = { up: 0, down: 0 };
    const placed = entries.map((e, i) => {
      const x = xFor(e.date);
      const side = i % 2 === 0 ? 'up' : 'down';
      level[side] = last[side] !== null && x - last[side] < MIN_GAP ? Math.min(level[side] + 1, MAX_LEVEL) : 0;
      last[side] = x;
      return Object.assign({ x, side, level: level[side] }, e);
    });
    const maxLevel = placed.reduce((m, e) => Math.max(m, e.level), 0);
    const height = 170 + maxLevel * STEP;
    const color = tl.color || '#053057';
    const font = 'font-family="Inter, sans-serif"';

    const axis = months.map((m, i) => {
      const x = LEFT + i * MONTH_W;
      const label = m.toLocaleDateString(locale(), { month: 'short', year: '2-digit' }).replace('.', '');
      return `<text x="${x + MONTH_W / 2}" y="${height - 8}" text-anchor="middle" font-size="9" font-weight="700" fill="#8A9096" ${font}>${esc(label)}</text>` +
        `<line x1="${x}" y1="${LINE_Y - 4}" x2="${x}" y2="${LINE_Y + 4}" stroke="#DCE0E2"/>`;
    }).join('');
    const marks = placed.map(e => {
      const x = e.x.toFixed(1);
      const off = STEM + e.level * STEP;
      const y2 = e.side === 'up' ? LINE_Y - off : LINE_Y + off;
      const ly = e.side === 'up' ? y2 - 6 : y2 + 13;
      const c = e.it.group.color;
      return `<g class="tl-point" data-goto="${esc(e.it.id)}"><title>${esc(e.it.fullLabel + ' — ' + e.it.group.name + ': ' + fmtDate(e.date))}</title>` +
        `<line x1="${x}" y1="${LINE_Y}" x2="${x}" y2="${y2}" class="tl-point-stem" stroke="${color}" stroke-width="1.3" stroke-dasharray="2 2"/>` +
        `<circle cx="${x}" cy="${LINE_Y}" r="5" class="tl-point-dot" fill="${c}" stroke="#FFFFFF" stroke-width="1.5"/>` +
        `<text x="${x}" y="${ly}" text-anchor="middle" font-size="9" font-weight="800" fill="${color}" ${font}>${esc(e.it.shortLabel)}</text></g>`;
    }).join('');
    const tx = xFor(now).toFixed(1);
    const today = `<line x1="${tx}" y1="14" x2="${tx}" y2="${height - 20}" stroke="#ef4444" stroke-width="1.3" stroke-dasharray="4 3"/>` +
      `<text x="${tx}" y="10" text-anchor="middle" font-size="8" font-weight="800" fill="#ef4444" ${font}>HOY</text>`;

    return `<div class="tl-scroll"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
      `${axis}<line x1="${LEFT}" y1="${LINE_Y}" x2="${width - 10}" y2="${LINE_Y}" stroke="#DCE0E2" stroke-width="1.5"/>${marks}${today}</svg></div>` +
      `<div class="progress-legend"><span class="legend-item"><span class="swatch" style="background:${color}"></span>${esc(tl.leyenda || tl.titulo)} · ${entries.length}</span>` +
      `<span class="legend-item">El color del punto indica la ${esc(state.project.grupos.singular.toLowerCase())}</span></div>`;
  }

  function blockedTitle() {
    const d = state.project.ciclo.alertas.diasBloqueo;
    return 'Bloqueos' + (d > 0 ? ` (+${d} días)` : '');
  }

  function blockedList() {
    const min = state.project.ciclo.alertas.diasBloqueo;
    const rows = [];
    state.data.items.forEach(it => model.blockedEntries(it).forEach(b => {
      const days = daysSince(b.date);
      if (min > 0 && (days === null || days < min)) return;
      rows.push(Object.assign({ it, days }, b));
    }));
    if (!rows.length) {
      return `<div class="empty-note">✅ No hay bloqueos${min > 0 ? ` con más de ${min} días` : ''}.</div>`;
    }
    rows.sort((a, b) => (b.days === null ? -1 : b.days) - (a.days === null ? -1 : a.days));
    const kindLabel = { actualizado: 'última actualización', inicio: 'inicio de la etapa', hito: 'fecha del hito' };
    return `<div class="blocked-list">${rows.map(r => `
      <div class="blocked-item">
        <div>⛔</div>
        <div>
          <div class="blocked-item-title"><a href="#" data-goto="${esc(r.it.id)}">${esc(r.it.fullLabel)}</a> <span class="section-hint">${esc(r.it.group.label)}</span></div>
          <div class="blocked-item-what">${esc(r.what)}${r.date ? ` · ${esc(kindLabel[r.dateKind] || 'desde')} ${esc(fmtDate(r.date))}` : ''}</div>
        </div>
        ${r.days !== null ? `<div class="blocked-item-days" title="Días desde la ${esc(kindLabel[r.dateKind] || 'fecha de referencia')}">${r.days}d</div>` : '<div class="blocked-item-days unknown" title="Sin fecha de referencia">—</div>'}
      </div>`).join('')}</div>`;
  }

  // ------------------------------------------------------------ vista grupo

  function renderGroup(g) {
    const p = state.project;
    const counts = p.ciclo.clasificacion
      .map(r => [r, g.items.filter(it => it.state && it.state.clave === r.clave).length])
      .filter(([, n]) => n)
      .map(([r, n]) => `<span class="legend-item"><span class="swatch" style="background:${r.color}"></span>${esc(r.etiqueta)}: <b>${n}</b></span>`)
      .join('');
    $('view').innerHTML = `
      <div class="group-toolbar">
        <input id="filterInput" type="search" placeholder="Buscar ${esc(p.items.corto || p.items.singular.toLowerCase())} por código o nombre…" value="${esc(state.filter)}">
        <button class="btn" id="expandAll">Expandir todo</button>
        <button class="btn" id="collapseAll">Colapsar todo</button>
      </div>
      <div class="progress-legend" style="margin:-4px 0 16px;border:none;padding:0">${counts}</div>
      <div class="cards" id="cards"></div>`;
    $('filterInput').addEventListener('input', e => { state.filter = e.target.value; renderCards(g); });
    $('expandAll').addEventListener('click', () => { g.items.forEach(it => state.expanded.add(it.id)); renderCards(g); });
    $('collapseAll').addEventListener('click', () => { g.items.forEach(it => state.expanded.delete(it.id)); renderCards(g); });
    renderCards(g);
  }

  function renderCards(g) {
    const q = norm(state.filter);
    const list = g.items.filter(it => !q || norm(it.fullLabel).indexOf(q) !== -1);
    $('cards').innerHTML = list.length ? list.map(itemCard).join('')
      : `<div class="cards-empty">Ninguna ${esc(state.project.items.corto || 'ítem')} coincide con «${esc(state.filter)}».</div>`;
  }

  function itemCard(it) {
    const p = state.project;
    const expanded = state.expanded.has(it.id);
    const known = it.stages.filter(s => s.known);
    const doneStages = known.filter(s => s.status === 'done').length;
    const cur = it.currentStage;
    const st = it.state;

    const header = `
      <div class="item-header">
        <div class="item-title">
          <span class="item-code">${esc(it.code || 'sin código')}</span>
          <span>${esc(it.name)}</span>
          ${it.url ? `<a class="item-link" href="${esc(it.url)}" target="_blank" rel="noopener" title="Abrir en ClickUp">↗</a>` : ''}
        </div>
        <div class="item-header-right">
          ${known.length ? `<span class="mini-progress" title="Etapas finalizadas">${doneStages}/${known.length}<span class="mini-bar"><span style="width:${doneStages / known.length * 100}%"></span></span></span>` : ''}
          <span class="pill status-${cur ? cur.status : 'backlog'}" title="Etapa actual">${esc(cur ? cur.name : 'Sin etapa iniciada')}</span>
          ${st ? `<span class="pill state" style="background:${st.color}">${esc(st.icono || '')} ${esc(st.etiqueta)}</span>` : ''}
          <span class="toggle-icon">▾</span>
        </div>
      </div>`;

    const sections = [section('Etapas', stageFlow(it))];
    if (it.activities.length) sections.push(section('Otras actividades', activityRows(it)));
    if (p.ciclo.hitos.length) sections.push(section('Hitos', milestoneRows(it)));

    return `<div class="item-card${expanded ? '' : ' collapsed'}" id="card-${esc(it.id)}" data-id="${esc(it.id)}" style="--group:${it.group.color}">
      ${header}
      <div class="item-body"><div class="item-body-inner">${sections.join('')}</div></div>
    </div>`;
  }

  const section = (title, body) => `<div class="item-section"><div class="section-label">${esc(title)}</div>${body}</div>`;

  function stageFlow(it) {
    if (!it.stages.length) return `<div class="empty-note neutral">Sin etapas registradas en ClickUp.</div>`;
    return `<div class="stage-flow">${it.stages.map((s, i) => {
      let badge = '';
      if (s.status === 'doing' || s.status === 'blocked') {
        if (s.countMonths && s.start) { const m = monthsSince(s.start); badge = `<span class="stage-badge months">${plural(m, 'mes', 'meses')}</span>`; }
        else if (s.start) { const d = daysSince(s.start); badge = `<span class="stage-badge" title="Días desde el inicio de la etapa">${d >= 0 ? plural(d, 'día', 'días') : 'inicia en ' + plural(-d, 'día', 'días')}</span>`; }
      }
      const dates = s.start ? `<span class="stage-dates">${esc(fmtDate(s.start, true))}${s.end && s.end !== s.start ? ' – ' + esc(fmtDate(s.end, true)) : ''}</span>` : '';
      const notes = s.blockedItems.map(n => `<div class="stage-block-note">🚨 ${esc(n)}</div>`).join('');
      const box = `<a class="stage-box status-${s.status}" href="${esc(s.url || '#')}" target="_blank" rel="noopener" title="${esc(s.name)}">${esc(s.name)}${dates}${badge}</a>`;
      return `<div class="stage-col">${box}${notes}</div>` + (i < it.stages.length - 1 ? '<span class="stage-arrow">→</span>' : '');
    }).join('')}</div>`;
  }

  function activityRows(it) {
    return `<div class="row-list">${it.activities.map(a => `
      <div class="row">
        <div class="dot dot-${a.status}"></div>
        <div class="row-name"><a href="${esc(a.url || '#')}" target="_blank" rel="noopener" title="${esc(a.name)}">${esc(a.name)}</a></div>
        <span class="date-pill date-${a.status}">${esc(statusLabel(a.status))}</span>
      </div>`).join('')}</div>`;
  }

  function statusLabel(s) {
    return { done: 'Finalizada', doing: 'En curso', blocked: 'Bloqueada', backlog: 'Pendiente' }[s] || s;
  }

  function milestoneRows(it) {
    const stall = state.project.ciclo.alertas.diasEstancado;
    const row = (m, sub) => {
      const days = daysSince(m.date);
      const stalled = days !== null && days > stall && m.status === 'doing';
      const dateCls = stalled ? 'date-overdue' : 'date-' + m.status;
      const alert = m.status === 'blocked' ? '<span title="Hito bloqueado">🚨</span> ' : '';
      const date = m.date
        ? `<span>${alert}<span class="date-pill ${dateCls}">${esc(fmtDate(m.date))}<span class="days-badge">${days}d</span></span></span>`
        : `<span>${alert}<span class="date-pill date-empty">Sin fecha</span></span>`;
      return `<div class="row${sub ? ' sub' : ''}${m.missing || !m.date ? ' missing' : ''}">
        <div class="dot ${m.date ? 'dot-' + m.status : 'dot-empty'}"></div>
        <div class="row-name" title="${esc(m.name)}${m.missing ? ' (no existe en ClickUp)' : ''}">${esc(m.name)}</div>
        ${date}
      </div>`;
    };
    return `<div class="row-list">${it.milestones.map(m => row(m, false) + (m.subs || []).map(s => row(s, true)).join('')).join('')}</div>`;
  }

  // ------------------------------------------------------------ PDF

  // Captura visual (html2canvas) de la vista activa en un PDF A4 paginado
  // (jsPDF). Es una imagen, no texto seleccionable.
  async function exportPdf() {
    const btn = $('exportPdfBtn');
    const target = $('view');
    if (!state.loaded || !target.innerHTML.trim()) return alert('Todavía no hay datos cargados para exportar.');
    if (typeof html2canvas === 'undefined' || !window.jspdf) {
      return alert('No se pudieron cargar las librerías de exportación. Revisa tu conexión e intenta de nuevo.');
    }
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Generando PDF…';

    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-capture';
    Object.assign(wrapper.style, {
      position: 'fixed', top: '0', left: '-99999px',
      width: Math.max(target.offsetWidth + 64, 1100) + 'px', background: '#F4F3F0', paddingBottom: '24px'
    });
    const header = document.querySelector('header').cloneNode(true);
    header.querySelectorAll('select, button').forEach(n => n.remove());
    // Con file:// las imágenes no embebidas "contaminan" el canvas y la
    // exportación falla; en ese caso se omiten (el build las embebe).
    header.querySelectorAll('img').forEach(img => { if (!/^data:/.test(img.getAttribute('src') || '')) img.remove(); });
    wrapper.appendChild(header);
    const title = document.createElement('div');
    title.className = 'wrap';
    title.innerHTML = `<div class="section-label">${esc(state.view === 'general' ? 'Vista general' : state.project.grupos.singular + ': ' + findGroup(state.view).name)}</div>`;
    wrapper.appendChild(title);
    const content = target.cloneNode(true);
    content.querySelectorAll('.group-toolbar').forEach(n => n.remove());
    wrapper.appendChild(content);
    document.body.appendChild(wrapper);

    try {
      const canvas = await html2canvas(wrapper, { scale: 2, backgroundColor: '#F4F3F0', useCORS: true });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'pt', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const imgW = pageW - margin * 2;
      const imgH = canvas.height * imgW / canvas.width;
      const usable = pageH - margin * 2;
      const img = canvas.toDataURL('image/png');
      let left = imgH;
      pdf.addImage(img, 'PNG', margin, margin, imgW, imgH);
      left -= usable;
      while (left > 0) {
        pdf.addPage();
        pdf.addImage(img, 'PNG', margin, margin - (imgH - left), imgW, imgH);
        left -= usable;
      }
      const viewSlug = state.view === 'general' ? 'general' : norm(findGroup(state.view).label).replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      pdf.save(`estado-${state.project.clave}-${viewSlug}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      alert('No se pudo generar el PDF: ' + err.message);
    } finally {
      document.body.removeChild(wrapper);
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  init();
})();
