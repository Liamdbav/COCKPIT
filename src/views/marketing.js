const invoke = (...args) => window.__TAURI__.core.invoke(...args);
const listen  = (event, cb) => window.__TAURI__.event.listen(event, cb);

const PLATFORMS = ['linkedin', 'facebook', 'twitter'];

// Listeners actifs — unlisten() est appelé à chaque fin de génération ou changement de plateforme
let activeUnlisteners = [];

async function cleanupListeners() {
  for (const fn of activeUnlisteners) {
    try { await fn(); } catch (_) {}
  }
  activeUnlisteners = [];
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

export function renderMarketing(container) {
  container.innerHTML = `
    <div class="marketing-view">
      <div class="section-header">
        <h1 class="section-title">Marketing</h1>
      </div>

      <div class="mkt-tabs">
        ${PLATFORMS.map((p, i) => `
          <button class="mkt-tab ${i === 0 ? 'active' : ''}" data-platform="${p}">
            ${p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        `).join('')}
      </div>

      <div class="mkt-conversation" id="mkt-conv"></div>

      <div class="mkt-input-bar">
        <textarea
          class="input mkt-textarea"
          id="mkt-subject"
          placeholder="Sujet ou idée de post…"
          rows="2"
        ></textarea>
        <button class="btn btn-primary" id="mkt-generate-btn">Générer</button>
      </div>
    </div>
  `;

  // Nettoyage des listeners orphelins si on navigue hors de la vue
  // (le prochain renderMarketing appellera cleanupListeners via les tabs/generate)
  cleanupListeners();

  bindTabs(container);
  bindInput(container);
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

let currentPlatform = 'linkedin';

function bindTabs(container) {
  container.querySelectorAll('.mkt-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      if (tab.dataset.platform === currentPlatform) return;

      await cleanupListeners();
      currentPlatform = tab.dataset.platform;

      container.querySelectorAll('.mkt-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      container.querySelector('#mkt-conv').innerHTML = '';
    });
  });
}

// ── Saisie et déclenchement ───────────────────────────────────────────────────

function bindInput(container) {
  const btn      = container.querySelector('#mkt-generate-btn');
  const textarea = container.querySelector('#mkt-subject');

  btn.addEventListener('click', () => generate(container));

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      generate(container);
    }
  });
}

async function generate(container) {
  const textarea = container.querySelector('#mkt-subject');
  const subject  = textarea.value.trim();
  if (!subject) return;

  // On arrête proprement toute génération précédente
  await cleanupListeners();

  const conv = container.querySelector('#mkt-conv');

  // Bulle utilisateur (droite)
  const userBubble = document.createElement('div');
  userBubble.className   = 'mkt-bubble mkt-bubble-user';
  userBubble.textContent = subject;
  conv.appendChild(userBubble);
  textarea.value = '';
  scrollBottom(conv);

  // Bulle assistant vide, éditable inline (gauche)
  const asstBubble = document.createElement('div');
  asstBubble.className       = 'mkt-bubble mkt-bubble-asst';
  asstBubble.contentEditable = 'true';
  asstBubble.setAttribute('aria-label', 'Réponse générée — modifiable avant copie');
  asstBubble.setAttribute('spellcheck', 'false');
  conv.appendChild(asstBubble);
  scrollBottom(conv);

  // Listeners SSE — stockés pour pouvoir les unlisten proprement
  const unlistenChunk = await listen('post_chunk', (e) => {
    asstBubble.appendChild(document.createTextNode(e.payload));
    scrollBottom(conv);
  });

  const unlistenDone = await listen('post_done', async () => {
    await cleanupListeners();
    addCopyButton(asstBubble, conv);
  });

  const unlistenError = await listen('post_error', async (e) => {
    await cleanupListeners();
    // On remplace le contenu de la bulle par le message d'erreur
    asstBubble.textContent = '';
    asstBubble.classList.add('mkt-bubble-error');
    asstBubble.appendChild(document.createTextNode(e.payload));
    scrollBottom(conv);
  });

  activeUnlisteners = [unlistenChunk, unlistenDone, unlistenError];

  // Le invoke retourne Ok(()) — les erreurs métier passent par post_error
  try {
    await invoke('generate_post', { platform: currentPlatform, subject });
  } catch (err) {
    // Erreur critique (DB inaccessible, command inconnue…)
    await cleanupListeners();
    asstBubble.textContent = '';
    asstBubble.classList.add('mkt-bubble-error');
    asstBubble.appendChild(document.createTextNode(String(err)));
    scrollBottom(conv);
  }
}

// ── Bouton Copier ──────────────────────────────────────────────────────────────

function addCopyButton(bubble, conv) {
  const btn = document.createElement('button');
  btn.className   = 'btn btn-sm mkt-copy-btn';
  btn.textContent = 'Copier';

  btn.addEventListener('click', async () => {
    try {
      // innerText gère contenteditable + sauts de ligne naturellement
      await navigator.clipboard.writeText(bubble.innerText);
      btn.textContent = '✓ Copié';
      setTimeout(() => { btn.textContent = 'Copier'; }, 2000);
    } catch (_) {
      btn.textContent = 'Erreur';
      setTimeout(() => { btn.textContent = 'Copier'; }, 2000);
    }
  });

  bubble.after(btn);
  scrollBottom(conv);
}

// ── Utilitaires ───────────────────────────────────────────────────────────────

function scrollBottom(conv) {
  conv.scrollTop = conv.scrollHeight;
}
