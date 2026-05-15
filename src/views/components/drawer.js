// Singleton drawer — une seule instance réutilisée par toutes les vues
let _overlay = null;
let _drawer = null;

function _ensureDOM() {
  if (_overlay) return;

  _overlay = document.createElement('div');
  _overlay.className = 'overlay';
  _overlay.addEventListener('click', closeDrawer);

  _drawer = document.createElement('div');
  _drawer.className = 'drawer';

  document.body.appendChild(_overlay);
  document.body.appendChild(_drawer);
}

export function openDrawer(renderFn) {
  _ensureDOM();
  _drawer.innerHTML = '';
  renderFn(_drawer);
  _overlay.classList.add('active');
  _drawer.classList.add('active');
}

export function closeDrawer() {
  if (!_overlay) return;
  _overlay.classList.remove('active');
  _drawer.classList.remove('active');
}
