import { invoke, escHtml, createStatusBadge, skeletonRows, onInteract, showError } from './components/utils.js';
import { openDrawer, closeDrawer } from './components/drawer.js';
import { openModal } from './components/modal.js';

// ── Point d'entrée ────────────────────────────────────────────────────────────

export async function renderProjects(container) {
  container.innerHTML = `
    <div class="section-header">
      <h1 class="section-title">Projets</h1>
    </div>
    <div id="projects-body" class="section-content">
      ${skeletonRows(5)}
    </div>
  `;

  await loadArchive(container.querySelector('#projects-body'));
}

// ── Liste archive ─────────────────────────────────────────────────────────────

async function loadArchive(body) {
  let allProjects;
  try {
    allProjects = await invoke('get_all_projects');
  } catch (err) {
    body.innerHTML = `<p style="color:var(--danger);font-size:13px;">Erreur : ${escHtml(String(err))}</p>`;
    return;
  }

  body.innerHTML = `
    <div class="archive-toolbar">
      <input class="input" id="search-projects" placeholder="Rechercher par nom ou client…" autocomplete="off">
      <select class="status-select" id="filter-status">
        <option value="">Tous les statuts</option>
        <option value="planned">Prévu</option>
        <option value="active">En cours</option>
        <option value="delivered">Livré</option>
      </select>
      <button class="btn btn-primary" id="btn-new-project">+ Nouveau projet</button>
    </div>
    <div id="project-rows"></div>
  `;

  const searchEl = body.querySelector('#search-projects');
  const filterEl = body.querySelector('#filter-status');
  const rowsEl   = body.querySelector('#project-rows');

  body.querySelector('#btn-new-project').addEventListener('click', () =>
    openCreateProjectModal(async () => {
      // Recharge la liste complète après création
      allProjects = await invoke('get_all_projects');
      renderRows();
    })
  );

  function renderRows() {
    const query  = searchEl.value.trim().toLowerCase();
    const status = filterEl.value;

    const filtered = allProjects.filter(p => {
      const matchText = !query
        || p.name.toLowerCase().includes(query)
        || p.client_name.toLowerCase().includes(query);
      const matchStatus = !status || p.status === status;
      return matchText && matchStatus;
    });

    if (filtered.length === 0) {
      rowsEl.innerHTML = `<p style="color:var(--text-muted);font-size:13px;margin-top:16px;">Aucun résultat.</p>`;
      return;
    }

    rowsEl.innerHTML = filtered.map(p => projectRow(p)).join('');

    rowsEl.querySelectorAll('.project-row').forEach(row => {
      onInteract(row, () => {
        const proj = allProjects.find(p => p.id === row.dataset.id);
        if (!proj) return;
        openProjectDrawer(
          proj,
          (newStatus) => onStatusChange(allProjects, rowsEl, proj, newStatus),
          () => {
            const idx = allProjects.findIndex(p => p.id === proj.id);
            if (idx !== -1) allProjects.splice(idx, 1);
            renderRows();
          },
        );
      });
    });
  }

  searchEl.addEventListener('input', renderRows);
  filterEl.addEventListener('change', renderRows);
  renderRows();
}

function projectRow(p) {
  const label = { planned: 'Prévu', active: 'En cours', delivered: 'Livré' }[p.status] ?? p.status;
  const entriesLabel = p.entry_count === 1 ? '1 entrée' : `${p.entry_count} entrées`;
  return `
    <div class="project-row${p.status === 'delivered' ? ' delivered' : ''}" data-id="${escHtml(p.id)}" tabindex="0" role="button" aria-label="Ouvrir ${escHtml(p.name)}">
      <div class="project-row-left">
        <span class="project-row-name">${escHtml(p.name)}</span>
        <span class="project-row-client">${escHtml(p.client_name)}</span>
      </div>
      <div class="project-row-right">
        <span class="project-row-entries">${entriesLabel}</span>
        <span class="project-row-badge">${createStatusBadge(p.status)}</span>
        <span class="project-row-date">${formatDate(p.created_at)}</span>
      </div>
    </div>
  `;
}

function onStatusChange(allProjects, rowsEl, proj, newStatus) {
  proj.status = newStatus;
  const row = rowsEl.querySelector(`.project-row[data-id="${proj.id}"]`);
  if (!row) return;
  row.classList.toggle('delivered', newStatus === 'delivered');
  const badgeEl = row.querySelector('.project-row-badge');
  if (badgeEl) badgeEl.innerHTML = createStatusBadge(newStatus);
}

// ── Drawer projet ─────────────────────────────────────────────────────────────

export function openProjectDrawer(proj, onStatusChange, onDelete) {
  openDrawer(async drawer => {
    drawer.innerHTML = skeletonRows(4);

    let clientDetail;
    try {
      clientDetail = await invoke('get_client_detail', { id: proj.client_id });
    } catch (err) {
      drawer.innerHTML = `<p style="color:var(--danger);font-size:13px;">Erreur : ${escHtml(String(err))}</p>`;
      return;
    }

    const project = clientDetail.projects.find(p => p.id === proj.id);
    if (!project) {
      drawer.innerHTML = `<p style="color:var(--danger);font-size:13px;">Projet introuvable.</p>`;
      return;
    }

    renderDrawerContent(drawer, project, clientDetail.name, proj, onStatusChange, onDelete);
  });
}

function renderDrawerContent(drawer, project, clientName, projRef, onStatusChangeCb, onDeleteCb) {
  const statusOptions = ['planned', 'active', 'delivered'];
  const statusOpts = statusOptions.map(s =>
    `<option value="${s}" ${s === project.status ? 'selected' : ''}>${statusLabel(s)}</option>`
  ).join('');

  drawer.innerHTML = `
    <div class="drawer-project-header">
      <div class="drawer-project-title">${escHtml(project.name)}</div>
      <div class="drawer-project-meta">
        <span class="drawer-client-name">${escHtml(clientName)}</span>
        <select class="status-select drawer-status-select">${statusOpts}</select>
      </div>
    </div>

    <div class="drawer-section-label" id="drawer-entries-label">Historique — ${project.entries.length} entrée${project.entries.length !== 1 ? 's' : ''}</div>
    <div class="drawer-entries" id="drawer-entries"></div>

    <div class="drawer-section-label" style="margin-top:24px;">Nouvelle entrée</div>
    <div class="entry-form">
      <div class="entry-form-field">
        <label class="detail-label">Contenu / avancement</label>
        <textarea class="input" id="ef-content" rows="3" placeholder="Ce qui a été fait…"></textarea>
      </div>
      <div class="entry-form-field">
        <label class="detail-label">Dernières actions</label>
        <textarea class="input" id="ef-actions" rows="2" placeholder="Actions réalisées…"></textarea>
      </div>
      <div class="entry-form-field">
        <label class="detail-label">Prochains défis</label>
        <textarea class="input" id="ef-challenges" rows="2" placeholder="Points bloquants, prochaines étapes…"></textarea>
      </div>
      <div class="entry-form-footer">
        <button class="btn btn-danger btn-sm" id="btn-delete-project">Supprimer le projet</button>
        <button class="btn" id="btn-drawer-close">Fermer</button>
        <button class="btn btn-primary" id="btn-add-entry">Ajouter l'entrée</button>
      </div>
    </div>
  `;

  const entriesEl = drawer.querySelector('#drawer-entries');
  const labelEl   = drawer.querySelector('#drawer-entries-label');
  renderEntries(entriesEl, project.entries, labelEl);

  // Fermeture
  drawer.querySelector('#btn-drawer-close').addEventListener('click', closeDrawer);

  // Suppression du projet
  const btnDelProj = drawer.querySelector('#btn-delete-project');
  btnDelProj.addEventListener('click', async () => {
    if (!btnDelProj.classList.contains('btn-danger-armed')) {
      btnDelProj.classList.add('btn-danger-armed');
      btnDelProj.textContent = 'Confirmer ?';
      setTimeout(() => {
        btnDelProj.classList.remove('btn-danger-armed');
        btnDelProj.textContent = 'Supprimer le projet';
      }, 3000);
      return;
    }
    try {
      await invoke('delete_project', { id: project.id });
      closeDrawer();
      if (onDeleteCb) onDeleteCb();
    } catch (err) {
      showError('Erreur : ' + err);
    }
  });

  // Changement de statut
  drawer.querySelector('.drawer-status-select').addEventListener('change', async (e) => {
    const newStatus = e.target.value;
    try {
      await invoke('update_project_status', { id: project.id, status: newStatus });
      project.status = newStatus;
      onStatusChangeCb(newStatus);
    } catch (err) {
      showError('Erreur : ' + err);
      e.target.value = project.status;
    }
  });

  // Ajout d'une entrée
  drawer.querySelector('#btn-add-entry').addEventListener('click', async () => {
    const content    = drawer.querySelector('#ef-content').value.trim();
    const actions    = drawer.querySelector('#ef-actions').value.trim();
    const challenges = drawer.querySelector('#ef-challenges').value.trim();

    if (!content && !actions && !challenges) {
      drawer.querySelector('#ef-content').focus();
      return;
    }

    try {
      await invoke('add_build_entry', {
        payload: { project_id: project.id, content, last_actions: actions, next_challenges: challenges },
      });

      // Recharge les entrées depuis la DB
      const updated = await invoke('get_client_detail', { id: projRef.client_id });
      const updatedProject = updated.projects.find(p => p.id === project.id);
      if (updatedProject) {
        project.entries = updatedProject.entries;
        renderEntries(entriesEl, project.entries, labelEl);
        projRef.entry_count = updatedProject.entries.length;
      }

      // Vide le formulaire
      drawer.querySelector('#ef-content').value = '';
      drawer.querySelector('#ef-actions').value = '';
      drawer.querySelector('#ef-challenges').value = '';

    } catch (err) {
      showError('Erreur : ' + err);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderEntries(container, entries, labelEl) {
  container.innerHTML = '';
  if (entries.length === 0) {
    const p = document.createElement('p');
    p.className = 'drawer-empty';
    p.textContent = 'Aucune entrée pour l\'instant.';
    container.appendChild(p);
    return;
  }
  for (const e of entries) {
    container.appendChild(buildEntryCardEl(e, container, labelEl));
  }
}

function buildEntryCardEl(e, container, labelEl) {
  const card = document.createElement('div');
  card.className = 'build-entry-card';
  card.dataset.id = e.id;

  function updateLabel() {
    if (!labelEl) return;
    const count = container.querySelectorAll('.build-entry-card').length;
    labelEl.textContent = `Historique — ${count} entrée${count !== 1 ? 's' : ''}`;
  }

  function showView() {
    card.innerHTML = `
      <div class="build-entry-date">${formatDate(e.created_at)}</div>
      ${e.content         ? `<p class="build-entry-field"><span class="build-entry-label">Contenu</span>${escHtml(e.content)}</p>` : ''}
      ${e.last_actions    ? `<p class="build-entry-field"><span class="build-entry-label">Actions</span>${escHtml(e.last_actions)}</p>` : ''}
      ${e.next_challenges ? `<p class="build-entry-field"><span class="build-entry-label">Défis</span>${escHtml(e.next_challenges)}</p>` : ''}
    `;

    const actions = document.createElement('div');
    actions.className = 'build-entry-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm';
    editBtn.textContent = 'Modifier';
    editBtn.addEventListener('click', showEdit);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-danger';
    delBtn.textContent = 'Supprimer';
    delBtn.addEventListener('click', async () => {
      if (!delBtn.classList.contains('btn-danger-armed')) {
        delBtn.classList.add('btn-danger-armed');
        delBtn.textContent = 'Confirmer ?';
        setTimeout(() => {
          if (delBtn.isConnected && delBtn.classList.contains('btn-danger-armed')) {
            delBtn.classList.remove('btn-danger-armed');
            delBtn.textContent = 'Supprimer';
          }
        }, 3000);
        return;
      }
      try {
        await invoke('delete_build_entry', { id: e.id });
        card.remove();
        updateLabel();
        if (container.querySelectorAll('.build-entry-card').length === 0) {
          const p = document.createElement('p');
          p.className = 'drawer-empty';
          p.textContent = 'Aucune entrée pour l\'instant.';
          container.appendChild(p);
        }
      } catch (err) {
        showError('Erreur : ' + err);
      }
    });

    actions.append(editBtn, delBtn);
    card.appendChild(actions);
  }

  function showEdit() {
    card.innerHTML = `
      <div class="build-entry-date">${formatDate(e.created_at)}</div>
      <div class="entry-form-field">
        <label class="build-entry-label">Contenu</label>
        <textarea class="input" data-edit="content" rows="2">${escHtml(e.content)}</textarea>
      </div>
      <div class="entry-form-field">
        <label class="build-entry-label">Actions</label>
        <textarea class="input" data-edit="actions" rows="2">${escHtml(e.last_actions)}</textarea>
      </div>
      <div class="entry-form-field">
        <label class="build-entry-label">Défis</label>
        <textarea class="input" data-edit="challenges" rows="2">${escHtml(e.next_challenges)}</textarea>
      </div>
    `;

    const footer = document.createElement('div');
    footer.className = 'entry-form-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm';
    cancelBtn.textContent = 'Annuler';
    cancelBtn.addEventListener('click', showView);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-sm btn-primary';
    saveBtn.textContent = 'Sauvegarder';
    saveBtn.addEventListener('click', async () => {
      const content         = card.querySelector('[data-edit="content"]').value.trim();
      const last_actions    = card.querySelector('[data-edit="actions"]').value.trim();
      const next_challenges = card.querySelector('[data-edit="challenges"]').value.trim();
      try {
        await invoke('update_build_entry', {
          id: e.id,
          payload: { project_id: e.project_id, content, last_actions, next_challenges },
        });
        e.content         = content;
        e.last_actions    = last_actions;
        e.next_challenges = next_challenges;
        showView();
      } catch (err) {
        showError('Erreur : ' + err);
      }
    });

    footer.append(cancelBtn, saveBtn);
    card.appendChild(footer);
  }

  showView();
  return card;
}

function statusLabel(s) {
  return { planned: 'Prévu', active: 'En cours', delivered: 'Livré' }[s] ?? s;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Modale création projet depuis la vue Projets ──────────────────────────────

async function openCreateProjectModal(onSuccess) {
  let clients;
  try {
    clients = await invoke('get_all_clients');
  } catch (err) {
    showError('Impossible de charger les clients : ' + err);
    return;
  }

  openModal(modal => {
    const clientOptions = clients.length === 0
      ? `<option value="" disabled>Aucun client disponible</option>`
      : clients.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('');

    modal.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Nouveau projet</span>
        <button class="btn modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-field">
          <label class="detail-label">Nom du projet *</label>
          <input class="input" id="new-project-name" type="text" placeholder="Ex. Site e-commerce">
        </div>
        <div class="form-field">
          <label class="detail-label">Client *</label>
          <select class="input" id="new-project-client">
            <option value="">— Sélectionner un client —</option>
            ${clientOptions}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="btn-cancel-project">Annuler</button>
        <button class="btn btn-primary" id="btn-save-project"${clients.length === 0 ? ' disabled' : ''}>Créer</button>
      </div>
    `;

    modal.querySelector('#btn-cancel-project').addEventListener('click', () => modal.closest('.overlay').remove());

    modal.querySelector('#btn-save-project').addEventListener('click', async () => {
      const name     = modal.querySelector('#new-project-name').value.trim();
      const clientId = modal.querySelector('#new-project-client').value;

      if (!name) { modal.querySelector('#new-project-name').focus(); return; }
      if (!clientId) { modal.querySelector('#new-project-client').focus(); return; }

      try {
        await invoke('create_project', { payload: { client_id: clientId, name } });
        modal.closest('.overlay').remove();
        await onSuccess();
      } catch (err) {
        showError('Erreur : ' + err);
      }
    });
  });
}
