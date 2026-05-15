import { invoke, escHtml, createStatusBadge, skeletonRows, onInteract, showError } from './components/utils.js';
import { openModal } from './components/modal.js';

// ── Point d'entrée de la vue ──────────────────────────────────────────────────

export async function renderClients(container) {
  container.innerHTML = `
    <div class="section-header">
      <h1 class="section-title">Clients</h1>
    </div>
    <div id="clients-body" class="section-content">
      ${skeletonRows(4)}
    </div>
  `;

  await loadClientList(container.querySelector('#clients-body'));
}

// ── Vue liste ─────────────────────────────────────────────────────────────────

async function loadClientList(body) {
  let clients;
  try {
    clients = await invoke('get_all_clients');
  } catch (err) {
    body.innerHTML = `<p style="color:var(--accent-mag);font-size:12px;">Erreur : ${escHtml(String(err))}</p>`;
    return;
  }

  body.innerHTML = `
    <div class="client-list-header">
      <button class="btn btn-primary" id="btn-new-client">+ Nouveau client</button>
    </div>
    <div id="client-rows">
      ${clients.length === 0
        ? `<p style="color:var(--text-dim);font-size:12px;margin-top:16px;">Aucun client pour l'instant.</p>`
        : clients.map(c => clientRow(c)).join('')
      }
    </div>
  `;

  body.querySelector('#btn-new-client').addEventListener('click', () => openCreateClientModal(async () => {
    await loadClientList(body);
  }));

  body.querySelectorAll('.client-row').forEach(row => {
    onInteract(row, async () => {
      await loadClientDetail(body, row.dataset.id);
    });
  });
}

function clientRow(c) {
  const typeLabel = c.client_type === 'company' ? 'Entreprise' : 'Particulier';
  const typeClass = c.client_type === 'company' ? 'type-company' : 'type-individual';
  const activeDot = c.has_active_project
    ? `<span class="active-dot" title="Projet actif"></span>`
    : '';
  return `
    <div class="client-row" data-id="${escHtml(c.id)}" tabindex="0" role="button" aria-label="Ouvrir la fiche de ${escHtml(c.name)}">
      <div class="client-row-name">
        ${activeDot}
        <span>${escHtml(c.name)}</span>
      </div>
      <div class="client-row-meta">
        <span class="type-tag ${typeClass}">${typeLabel}</span>
        <span class="client-row-email">${escHtml(c.email ?? '—')}</span>
      </div>
    </div>
  `;
}

// ── Vue détail client ─────────────────────────────────────────────────────────

async function loadClientDetail(body, id) {
  body.innerHTML = skeletonRows(5);

  let client;
  try {
    client = await invoke('get_client_detail', { id });
  } catch (err) {
    body.innerHTML = `<p style="color:var(--accent-mag);font-size:12px;">Erreur : ${escHtml(String(err))}</p>`;
    return;
  }

  renderDetail(body, client);
}

function renderDetail(body, client) {
  const typeLabel = client.client_type === 'company' ? 'Entreprise' : 'Particulier';
  const typeClass = client.client_type === 'company' ? 'type-company' : 'type-individual';

  body.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-top">
        <button class="btn btn-back" id="btn-back">← Retour</button>
        <button class="btn btn-danger btn-sm" id="btn-delete-client">Supprimer le client</button>
      </div>
      <div class="detail-title-row">
        <h2 class="detail-name">${escHtml(client.name)}</h2>
        <span class="type-tag ${typeClass}">${typeLabel}</span>
      </div>
    </div>

    <div class="detail-grid" id="detail-fields">
      ${detailField('Nom', 'name', client.name, 'text')}
      ${detailField('Email', 'email', client.email ?? '', 'email')}
      ${detailField('Téléphone', 'phone', client.phone ?? '', 'text')}
      ${detailField('Adresse', 'address', client.address ?? '', 'text')}
      ${detailField('Notes', 'notes', client.notes ?? '', 'textarea')}
    </div>

    <div class="section-separator"></div>

    <div class="projects-section">
      <div class="projects-section-header">
        <span class="projects-section-title">Projets</span>
        <button class="btn btn-primary btn-sm" id="btn-new-project">+ Nouveau projet</button>
      </div>
      <div id="project-list">
        ${client.projects.length === 0
          ? `<p style="color:var(--text-dim);font-size:12px;">Aucun projet.</p>`
          : client.projects.map(p => projectCard(p)).join('')
        }
      </div>
    </div>
  `;

  body.querySelector('#btn-back').addEventListener('click', () => loadClientList(body));

  const btnDel = body.querySelector('#btn-delete-client');
  btnDel.addEventListener('click', async () => {
    if (!btnDel.classList.contains('btn-danger-armed')) {
      btnDel.classList.add('btn-danger-armed');
      btnDel.textContent = 'Confirmer ?';
      setTimeout(() => {
        btnDel.classList.remove('btn-danger-armed');
        btnDel.textContent = 'Supprimer le client';
      }, 3000);
      return;
    }
    try {
      await invoke('delete_client', { id: client.id });
      await loadClientList(body);
    } catch (err) {
      // Le message Rust indique si des projets bloquent la suppression
      showError(String(err));
    }
  });

  body.querySelector('#btn-new-project').addEventListener('click', () =>
    openCreateProjectModal(client.id, async () => {
      const updated = await invoke('get_client_detail', { id: client.id });
      renderDetail(body, updated);
    })
  );

  // Édition inline — blur + Enter sauvegardent
  body.querySelectorAll('.editable').forEach(el => {
    el.addEventListener('blur', () => saveField(body, client));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && el.tagName !== 'TEXTAREA') { e.preventDefault(); el.blur(); } });
  });

  // Changement de statut projet
  body.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      try {
        await invoke('update_project_status', { id: sel.dataset.projectId, status: sel.value });
        const updated = await invoke('get_client_detail', { id: client.id });
        renderDetail(body, updated);
      } catch (err) {
        showError('Erreur : ' + err);
      }
    });
  });
}

function detailField(label, field, value, type) {
  const safeVal = escHtml(value);
  if (type === 'textarea') {
    return `
      <div class="detail-field">
        <label class="detail-label">${label}</label>
        <textarea class="input editable" data-field="${field}" rows="3">${safeVal}</textarea>
      </div>
    `;
  }
  return `
    <div class="detail-field">
      <label class="detail-label">${label}</label>
      <input class="input editable" type="${type}" data-field="${field}" value="${safeVal}">
    </div>
  `;
}

async function saveField(body, client) {
  const payload = {
    client_type: client.client_type,
    name: client.name,
    email: client.email ?? null,
    phone: client.phone ?? null,
    address: client.address ?? null,
    notes: client.notes ?? null,
  };

  body.querySelectorAll('.editable').forEach(el => {
    const f = el.dataset.field;
    const val = el.value.trim() || null;
    if (f === 'name') payload.name = val ?? client.name;
    else payload[f] = val;
  });

  try {
    await invoke('update_client', { id: client.id, payload });
    // Mise à jour silencieuse du titre
    const nameEl = body.querySelector('.detail-name');
    if (nameEl) nameEl.textContent = payload.name;
    // Synchronise l'objet local pour les saves suivants
    Object.assign(client, payload);
  } catch (err) {
    showError('Erreur sauvegarde : ' + err);
  }
}

function projectCard(p) {
  const statusOptions = ['planned', 'active', 'delivered'];
  const opts = statusOptions.map(s =>
    `<option value="${s}" ${s === p.status ? 'selected' : ''}>${statusLabel(s)}</option>`
  ).join('');

  return `
    <div class="project-card">
      <div class="project-card-header">
        <span class="project-name">${escHtml(p.name)}</span>
        <select class="status-select" data-project-id="${escHtml(p.id)}">${opts}</select>
      </div>
      <div class="project-card-meta">
        <span style="color:var(--text-dim);font-size:11px;">Créé le ${formatDate(p.created_at)}</span>
        ${p.delivered_at ? `<span style="color:var(--accent-green);font-size:11px;">Livré le ${formatDate(p.delivered_at)}</span>` : ''}
      </div>
    </div>
  `;
}

function statusLabel(s) {
  return { planned: 'Planifié', active: 'Actif', delivered: 'Livré' }[s] ?? s;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Modale création client ────────────────────────────────────────────────────

function openCreateClientModal(onSuccess) {
  openModal(modal => {
    modal.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Nouveau client</span>
        <button class="btn modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-field">
          <label class="detail-label">Type</label>
          <div class="type-toggle">
            <button class="type-btn active" data-value="individual">Particulier</button>
            <button class="type-btn" data-value="company">Entreprise</button>
          </div>
        </div>
        <div class="form-field">
          <label class="detail-label">Nom *</label>
          <input class="input" id="new-client-name" type="text" placeholder="Nom du client">
        </div>
        <div class="form-field">
          <label class="detail-label">Email</label>
          <input class="input" id="new-client-email" type="email" placeholder="email@exemple.com">
        </div>
        <div class="form-field">
          <label class="detail-label">Téléphone</label>
          <input class="input" id="new-client-phone" type="text" placeholder="+33 6 00 00 00 00">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="btn-cancel-client">Annuler</button>
        <button class="btn btn-primary" id="btn-save-client">Créer</button>
      </div>
    `;

    let selectedType = 'individual';
    modal.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedType = btn.dataset.value;
      });
    });

    modal.querySelector('#btn-cancel-client').addEventListener('click', () => modal.closest('.overlay').remove());

    modal.querySelector('#btn-save-client').addEventListener('click', async () => {
      const name = modal.querySelector('#new-client-name').value.trim();
      if (!name) { modal.querySelector('#new-client-name').focus(); return; }

      const email = modal.querySelector('#new-client-email').value.trim() || null;
      const phone = modal.querySelector('#new-client-phone').value.trim() || null;

      try {
        await invoke('create_client', {
          payload: { client_type: selectedType, name, email, phone, address: null, notes: null }
        });
        modal.closest('.overlay').remove();
        await onSuccess();
      } catch (err) {
        showError('Erreur : ' + err);
      }
    });
  });
}

// ── Modale création projet ────────────────────────────────────────────────────

function openCreateProjectModal(clientId, onSuccess) {
  openModal(modal => {
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
      </div>
      <div class="modal-footer">
        <button class="btn" id="btn-cancel-project">Annuler</button>
        <button class="btn btn-primary" id="btn-save-project">Créer</button>
      </div>
    `;

    modal.querySelector('#btn-cancel-project').addEventListener('click', () => modal.closest('.overlay').remove());

    modal.querySelector('#btn-save-project').addEventListener('click', async () => {
      const name = modal.querySelector('#new-project-name').value.trim();
      if (!name) { modal.querySelector('#new-project-name').focus(); return; }

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
