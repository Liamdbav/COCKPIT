const _invoke = window.__TAURI__?.core?.invoke;

export function invoke(cmd, args = {}) {
  if (!_invoke) return Promise.reject(new Error('Tauri invoke non disponible'));
  return _invoke(cmd, args);
}

export function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function createStatusBadge(status) {
  const labels = { planned: 'Planifié', active: 'Actif', delivered: 'Livré' };
  const label = labels[status] ?? escHtml(status);
  return `<span class="badge badge-${escHtml(status)}" aria-label="Statut : ${label}">${label}</span>`;
}

export function skeletonRows(n = 3) {
  return Array(n).fill('<div class="skeleton-row" aria-hidden="true"></div>').join('');
}

export function onInteract(el, fn) {
  el.addEventListener('click', fn);
  // On vérifie que le focus est bien sur l'élément lui-même et non sur un enfant
  // (évite que le keydown d'un bouton enfant remonte et déclenche l'action parente)
  el.addEventListener('keydown', (e) => {
    if (e.target !== el) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); }
  });
}

let _toastEl = null;

export function showError(msg) {
  if (_toastEl) { _toastEl.remove(); _toastEl = null; }
  const el = document.createElement('div');
  el.className = 'toast toast-error';
  el.textContent = msg;
  document.body.appendChild(el);
  _toastEl = el;
  setTimeout(() => { if (_toastEl === el) { el.remove(); _toastEl = null; } }, 4000);
}
