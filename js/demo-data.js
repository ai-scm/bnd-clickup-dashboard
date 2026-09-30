/* =============================================================================
 *  DATOS DE PRUEBA  (?demo=1)
 *  Genera tareas FICTICIAS con la misma forma que devuelve la API de ClickUp,
 *  a partir de la configuración del proyecto. Todos los nombres llevan
 *  «PRUEBA» para que nunca se confundan con información real.
 * ========================================================================== */
(function (global) {
  'use strict';

  const Dash = global.Dash = global.Dash || {};
  const DAY = 24 * 60 * 60 * 1000;

  // Pseudoaleatorio determinista: el demo se ve igual en cada carga.
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function demoTasks(project) {
    const rand = rng(42);
    const now = Date.now();
    const tasks = [];
    let seq = 0;
    const statusObj = st => ({ status: st, type: st === 'done' ? 'closed' : 'custom' });
    const mk = (name, parent, extra) => {
      const id = 'demo' + (++seq);
      const t = Object.assign({
        id: id, name: name, parent: parent || null, custom_item_id: 0,
        status: statusObj('to do'), url: '#demo-' + id,
        date_created: String(now - 400 * DAY + seq * 1000), date_updated: String(now - 3 * DAY),
        list: { id: 'demo-list', name: 'Lista de prueba' }
      }, extra || {});
      tasks.push(t);
      return t;
    };

    const items = project.items;
    const itemType = (items.tiposClickUp || [])[0];
    const stageDefs = (project.ciclo.etapas || []).map(e => typeof e === 'string' ? { nombre: e } : e);
    const milestones = (project.ciclo.hitos || []).map(h => typeof h === 'string' ? h : h.nombre);
    const re = items.patronNombre ? new RegExp(items.patronNombre, 'i') : null;
    const itemName = (n, label) => {
      const code = (items.prefijo || '') + String(n).padStart(items.digitos || 2, '0');
      const options = [code + ' - ' + label, code + '. ' + label];
      return options.find(o => !re || re.test(o)) || options[0];
    };

    const groupNames = ['Categoría de prueba A', 'Categoría de prueba B', 'Categoría de prueba C'];
    const byParent = project.grupos.fuente === 'padre';
    const usesRanges = project.grupos.fuente === 'rangos';
    let globalNum = 0;

    groupNames.forEach((gName, gi) => {
      const groupTask = byParent ? mk('[PRUEBA] ' + gName, null, { custom_item_id: 1001 }) : null;
      const count = 3 + Math.floor(rand() * 4);
      for (let i = 1; i <= count; i++) {
        // Con fuente «padre» la numeración se reinicia por grupo, como en Coljuegos.
        const n = usesRanges || !byParent ? ++globalNum * (usesRanges ? 5 : 1) : i;
        const noCode = byParent && itemType && i === count;
        const name = noCode ? '[PRUEBA] Historia sin código ' + (gi + 1)
          : itemName(n, '[PRUEBA] ' + (items.singular || 'Ítem') + ' de ejemplo ' + (gi + 1) + '.' + i);
        const extra = { custom_item_id: itemType || 0, list: { id: 'demo-list-' + gi, name: '[PRUEBA] ' + gName } };
        const item = mk(name, groupTask ? groupTask.id : null, extra);

        // Avance: cuántas etapas están terminadas en este ítem.
        const progress = Math.floor(rand() * (stageDefs.length + 1));
        const skipLast = rand() < 0.35;
        let cursor = now - (progress * 18 + 20) * DAY;
        stageDefs.forEach((def, si) => {
          if (skipLast && si === stageDefs.length - 1 && progress < stageDefs.length) return;
          let st = si < progress ? 'done' : si === progress ? 'doing' : 'to do';
          if (st === 'doing' && rand() < 0.3) st = 'blocked';
          const stage = mk(def.nombre, item.id, { status: statusObj(st) });
          const nActs = 1 + Math.floor(rand() * 3);
          for (let a = 1; a <= nActs; a++) {
            const start = cursor;
            const end = start + (3 + Math.floor(rand() * 8)) * DAY;
            cursor = end;
            const actSt = st === 'done' ? 'done' : st === 'blocked' && a === 1 ? 'blocked'
              : st === 'doing' ? (a === 1 ? 'done' : 'doing') : 'to do';
            mk('[PRUEBA] Actividad ' + (si + 1) + '.' + a, stage.id, {
              status: statusObj(actSt), start_date: String(start), due_date: String(end)
            });
          }
        });
        if (rand() < 0.3) mk('[PRUEBA] Actividad suelta', item.id, { status: statusObj(rand() < 0.5 ? 'doing' : 'done') });

        if (milestones.length) {
          const box = mk('Hitos ' + name.split(/[ .]/)[0], item.id);
          const reached = Math.floor(progress / stageDefs.length * milestones.length);
          milestones.forEach((m, mi) => {
            const st = mi < reached ? 'done' : mi === reached ? 'doing' : 'to do';
            mk(m, box.id, { status: statusObj(st), start_date: st === 'to do' ? null : String(now - (reached - mi + 1) * 25 * DAY) });
          });
        }

        if (progress >= stageDefs.length) {
          item.status = statusObj('done');
          item.date_closed = String(now - Math.floor(rand() * 120) * DAY);
        } else if (progress > 0) {
          item.status = statusObj('doing');
        }
      }
    });
    return tasks;
  }

  Dash.demoTasks = demoTasks;
  if (typeof module !== 'undefined' && module.exports) module.exports = Dash;
})(typeof window !== 'undefined' ? window : globalThis);
