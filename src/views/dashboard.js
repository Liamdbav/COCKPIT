import { invoke, escHtml, createStatusBadge, skeletonRows, onInteract } from './components/utils.js';
import { openProjectDrawer } from './projects.js';
import {
  getCategories, getCatMap, assignProjectCat,
  createCategory, deleteCategory, renameCategory, moveCategory,
} from './components/categories.js';

const PINNED_KEY = 'cockpit_pinned';

// ── Pin helpers ───────────────────────────────────────────────────────────────

function getPinned() {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY)) ?? []; }
  catch (_) { return []; }
}

function togglePin(id) {
  const pinned = getPinned();
  const idx = pinned.indexOf(id);
  if (idx === -1) pinned.push(id); else pinned.splice(idx, 1);
  localStorage.setItem(PINNED_KEY, JSON.stringify(pinned));
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

export async function renderDashboard(container) {
  container.innerHTML = `
    <div class="section-header">
      <h1 class="section-title">Dashboard</h1>
      <button class="btn btn-sm" id="btn-edit-mode">Organiser</button>
    </div>
    <div id="dashboard-body" class="section-content">
      ${skeletonRows(5)}
    </div>
  `;

  const body    = container.querySelector('#dashboard-body');
  const editBtn = container.querySelector('#btn-edit-mode');

  let projects;
  try {
    projects = await invoke('get_dashboard_projects');
  } catch (err) {
    body.innerHTML = `<p style="color:var(--danger);font-size:13px;">Erreur : ${escHtml(String(err))}</p>`;
    return;
  }

  let editMode = false;

  function render() {
    if (projects.length === 0 && !editMode) {
      body.innerHTML = `<p style="color:var(--text-muted);font-size:13px;margin-top:16px;">Aucun projet en cours ou planifié.</p>`;
      return;
    }
    renderContent(body, projects, editMode, render);
  }

  editBtn.addEventListener('click', () => {
    editMode = !editMode;
    editBtn.textContent = editMode ? 'Terminer' : 'Organiser';
    render();
  });

  render();
}

// ── Rendu principal ───────────────────────────────────────────────────────────

function renderContent(body, projects, editMode, rerender) {
  const categories = getCategories();
  const catMap     = getCatMap();
  const pinned     = getPinned();

  // Grouper les projets par catégorie
  const groups = new Map();
  for (const cat of categories) groups.set(cat.id, []);
  groups.set('__none__', []);

  for (const proj of projects) {
    const catId = catMap[proj.id];
    if (catId && groups.has(catId)) groups.get(catId).push(proj);
    else groups.get('__none__').push(proj);
  }

  // Trier chaque groupe : épinglés en premier
  for (const list of groups.values()) {
    list.sort((a, b) => (pinned.includes(a.id) ? 0 : 1) - (pinned.includes(b.id) ? 0 : 1));
  }

  body.innerHTML = '';

  // Catégories nommées + section "Sans catégorie"
  const sections = [
    ...categories.map(cat => ({ cat, items: groups.get(cat.id) })),
    { cat: { id: '__none__', name: 'Sans catégorie' }, items: groups.get('__none__') },
  ];

  for (const { cat, items } of sections) {
    // En mode normal, masquer les sections vides (sauf "Sans catégorie")
    if (!editMode && cat.id !== '__none__' && items.length === 0) continue;

    const section = buildSection(cat, items, categories, projects, pinned, editMode, rerender);
    body.appendChild(section);
  }

  // Bouton "Nouvelle catégorie" en mode édition
  if (editMode) {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-sm cat-add-btn';
    addBtn.textContent = '+ Nouvelle catégorie';

    const form = document.createElement('div');
    form.className = 'cat-add-form';
    form.hidden = true;

    const input = document.createElement('input');
    input.className = 'input';
    input.type = 'text';
    input.placeholder = 'Nom de la catégorie…';
    input.setAttribute('aria-label', 'Nom de la nouvelle catégorie');

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-sm btn-primary';
    confirmBtn.textContent = 'Créer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm';
    cancelBtn.textContent = 'Annuler';

    const submit = () => {
      if (input.value.trim()) { createCategory(input.value.trim()); rerender(); }
    };

    addBtn.addEventListener('click', () => { addBtn.hidden = true; form.hidden = false; input.focus(); });
    confirmBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', rerender);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { e.preventDefault(); rerender(); }
    });

    form.append(input, confirmBtn, cancelBtn);
    body.append(addBtn, form);
  }
}

// ── Section d'une catégorie ───────────────────────────────────────────────────

function buildSection(cat, items, allCats, allProjects, pinned, editMode, rerender) {
  const isNone = cat.id === '__none__';

  const section = document.createElement('div');
  section.className = 'cat-section';
  section.dataset.catId = cat.id;

  // ── Header ──────────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'cat-header';

  if (editMode && !isNone) {
    const input = document.createElement('input');
    input.className = 'cat-name-input';
    input.value = cat.name;
    input.setAttribute('aria-label', 'Nom de la catégorie');
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('blur', () => {
      if (input.value.trim() && input.value.trim() !== cat.name) {
        renameCategory(cat.id, input.value.trim());
        rerender();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    });

    const count = document.createElement('span');
    count.className = 'cat-count';
    count.textContent = String(items.length);

    const allCatsNow = getCategories();
    const catIdx = allCatsNow.findIndex(c => c.id === cat.id);

    const upBtn = document.createElement('button');
    upBtn.className = 'cat-order-btn';
    upBtn.setAttribute('aria-label', 'Monter');
    upBtn.textContent = '↑';
    upBtn.disabled = catIdx <= 0;
    upBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    upBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveCategory(catIdx, catIdx - 1);
      rerender();
    });

    const downBtn = document.createElement('button');
    downBtn.className = 'cat-order-btn';
    downBtn.setAttribute('aria-label', 'Descendre');
    downBtn.textContent = '↓';
    downBtn.disabled = catIdx >= allCatsNow.length - 1;
    downBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    downBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveCategory(catIdx, catIdx + 1);
      rerender();
    });

    // Suppression à deux états — évite window.confirm() non supporté dans Tauri
    const delBtn = document.createElement('button');
    delBtn.className = 'cat-delete-btn';
    delBtn.setAttribute('aria-label', `Supprimer ${cat.name}`);
    delBtn.textContent = '✕';
    delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!delBtn.dataset.armed) {
        delBtn.dataset.armed = '1';
        delBtn.textContent = 'Supprimer ?';
        delBtn.classList.add('cat-delete-armed');
        setTimeout(() => {
          if (delBtn.isConnected && delBtn.dataset.armed) {
            delete delBtn.dataset.armed;
            delBtn.textContent = '✕';
            delBtn.classList.remove('cat-delete-armed');
          }
        }, 3000);
        return;
      }
      deleteCategory(cat.id);
      rerender();
    });

    header.append(input, count, upBtn, downBtn, delBtn);

  } else {
    const nameEl = document.createElement('span');
    nameEl.className = 'cat-name';
    nameEl.textContent = cat.name;

    const count = document.createElement('span');
    count.className = 'cat-count';
    count.textContent = String(items.length);

    header.append(nameEl, count);
  }

  section.appendChild(header);

  // ── Body (drop zone projets) ─────────────────────────────────────────────────
  const bodyEl = document.createElement('div');
  bodyEl.className = 'cat-body';
  bodyEl.dataset.catId = cat.id;

  bodyEl.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('application/x-cockpit-project')) return;
    e.preventDefault();
    bodyEl.classList.add('cat-drop-over');
  });
  bodyEl.addEventListener('dragleave', (e) => {
    if (!bodyEl.contains(e.relatedTarget)) bodyEl.classList.remove('cat-drop-over');
  });
  bodyEl.addEventListener('drop', (e) => {
    e.preventDefault();
    bodyEl.classList.remove('cat-drop-over');
    const projId = e.dataTransfer.getData('application/x-cockpit-project');
    if (!projId) return;
    assignProjectCat(projId, isNone ? null : cat.id);
    rerender();
  });

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'cat-empty';
    empty.textContent = isNone
      ? (editMode ? 'Glissez des projets ici.' : 'Tous les projets sont catégorisés.')
      : 'Glissez des projets ici.';
    bodyEl.appendChild(empty);
  } else {
    for (const proj of items) {
      bodyEl.appendChild(buildProjectRow(proj, pinned, allProjects, cat.id, rerender));
    }
  }

  section.appendChild(bodyEl);
  return section;
}

// ── Ligne de projet ───────────────────────────────────────────────────────────

function buildProjectRow(proj, pinned, allProjects, currentCatId, rerender) {
  const isPinned = pinned.includes(proj.id);
  const cat      = getCategories().find(c => c.id === currentCatId);
  const catLabel = cat ? cat.name : '—';

  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.id = proj.id;
  row.setAttribute('tabindex', '0');
  row.setAttribute('role', 'button');
  row.setAttribute('aria-label', `Ouvrir ${proj.name}`);
  row.draggable = true;

  // Pin button
  const pinBtn = document.createElement('button');
  pinBtn.className = `pin-btn${isPinned ? ' pinned' : ''}`;
  pinBtn.dataset.id = proj.id;
  pinBtn.setAttribute('aria-label', isPinned ? 'Désépingler' : 'Épingler');
  pinBtn.setAttribute('title', isPinned ? 'Désépingler' : 'Épingler');
  pinBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 0 1 5 6.778V2.351a2.94 2.94 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354z"/>
  </svg>`;
  pinBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePin(proj.id); rerender(); });

  // Left content
  const typeLabel = proj.client_type === 'company' ? 'Entreprise' : 'Particulier';
  const typeClass = proj.client_type === 'company' ? 'type-company' : 'type-individual';

  const left = document.createElement('div');
  left.className = 'project-row-left';
  left.innerHTML = `
    <span class="project-row-name">${escHtml(proj.name)}</span>
    <span class="project-row-client">
      ${escHtml(proj.client_name)}<span class="type-tag ${typeClass}" style="margin-left:6px;">${typeLabel}</span>
    </span>
  `;

  // Cat chip
  const chip = document.createElement('button');
  chip.className = 'cat-chip';
  chip.textContent = catLabel;
  chip.title = 'Changer de catégorie';
  chip.addEventListener('click', (e) => { e.stopPropagation(); openCatPopover(chip, proj.id, rerender); });

  // Right content
  const right = document.createElement('div');
  right.className = 'project-row-right';
  const badge = document.createElement('span');
  badge.className = 'project-row-badge';
  badge.innerHTML = createStatusBadge(proj.status);
  const date = document.createElement('span');
  date.className = 'project-row-date';
  date.textContent = formatDate(proj.created_at);
  right.append(chip, badge, date);

  row.append(pinBtn, left, right);

  // DnD projet → catégorie
  row.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-cockpit-project', proj.id);
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => row.classList.remove('dragging'));

  // Clic → drawer
  onInteract(row, () => {
    openProjectDrawer(
      proj,
      (newStatus) => { proj.status = newStatus; badge.innerHTML = createStatusBadge(newStatus); },
      () => {
        const idx = allProjects.findIndex(p => p.id === proj.id);
        if (idx !== -1) allProjects.splice(idx, 1);
        rerender();
      },
    );
  });

  return row;
}

// ── Popover assignation catégorie ─────────────────────────────────────────────

function openCatPopover(anchor, projId, rerender) {
  document.querySelector('.cat-popover')?.remove();

  const categories = getCategories();
  const catMap     = getCatMap();
  const current    = catMap[projId] ?? null;

  const pop = document.createElement('div');
  pop.className = 'cat-popover';
  pop.setAttribute('role', 'listbox');
  pop.setAttribute('aria-label', 'Choisir une catégorie');

  const options = [{ id: null, name: '— Sans catégorie' }, ...categories];

  for (const opt of options) {
    const btn = document.createElement('button');
    btn.className = `cat-popover-item${opt.id === current ? ' active' : ''}`;
    btn.setAttribute('role', 'option');
    btn.textContent = opt.name;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      assignProjectCat(projId, opt.id);
      pop.remove();
      rerender();
    });
    pop.appendChild(btn);
  }

  document.body.appendChild(pop);
  const rect = anchor.getBoundingClientRect();
  // Positionner sous le chip, ou au-dessus si pas assez de place
  const spaceBelow = window.innerHeight - rect.bottom;
  pop.style.left = `${rect.left}px`;
  if (spaceBelow < 160) {
    pop.style.bottom = `${window.innerHeight - rect.top + 4}px`;
  } else {
    pop.style.top = `${rect.bottom + 4}px`;
  }

  // Fermer en cliquant ailleurs
  const close = (e) => {
    if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', close, true); }
  };
  setTimeout(() => document.addEventListener('click', close, true), 0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
