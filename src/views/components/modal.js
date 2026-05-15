// Ouvre une modale centrée ; fermeture via overlay ou bouton .modal-close
export function openModal(renderFn) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay active';

  const modal = document.createElement('div');
  modal.className = 'modal';
  renderFn(modal);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  modal.querySelectorAll('.modal-close').forEach(el => el.addEventListener('click', close));

  return close;
}
