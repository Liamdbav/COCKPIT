import { renderDashboard }  from './views/dashboard.js';
import { renderClients }    from './views/clients.js';
import { renderProjects }   from './views/projects.js';
import { renderMarketing }  from './views/marketing.js';
import { renderSettings }   from './views/settings.js';

// ── Thème ────────────────────────────────────────────────────────────────────

export function applyTheme(theme) {
  document.documentElement.classList.toggle('theme-light', theme === 'light');
}

function loadTheme() {
  try {
    const raw = localStorage.getItem('cockpit_settings');
    if (raw) {
      const { theme } = JSON.parse(raw);
      if (theme) applyTheme(theme);
    }
  } catch (_) { /* préférences corrompues, on ignore */ }
}

// ── Router ──────────────────────────────────────────────────────────────────
const VIEWS = {
  dashboard: renderDashboard,
  clients:   renderClients,
  projects:  renderProjects,
  marketing: renderMarketing,
  settings:  renderSettings,
};

function navigate(view) {
  if (!VIEWS[view]) return;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  const container = document.getElementById('content');
  container.innerHTML = '';
  VIEWS[view](container);
}

// ── Event delegation sur la sidebar ─────────────────────────────────────────
const sidebar = document.getElementById('sidebar');

sidebar.addEventListener('click', e => {
  const item = e.target.closest('.nav-item');
  if (item?.dataset.view) navigate(item.dataset.view);
});

sidebar.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const item = e.target.closest('.nav-item');
  if (item?.dataset.view) { e.preventDefault(); navigate(item.dataset.view); }
});

// ── Démarrage ───────────────────────────────────────────────────────────────
loadTheme();
navigate('dashboard');
