/**
 * Shared utility functions
 */

// XSS protection - escape HTML entities (also defined in app.js for dashboard)
function _escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ==================== TOAST NOTIFICATIONS ====================
/**
 * Display a beautiful premium toast notification
 * @param {string} message - The message to display
 * @param {string} type - success, error, warning, info
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  const labels = {
    success: typeof t === 'function' ? t('toast_success') : 'Success',
    error: typeof t === 'function' ? t('toast_error') : 'Error',
    warning: typeof t === 'function' ? t('toast_warning') : 'Warning',
    info: typeof t === 'function' ? t('toast_info') : 'Info'
  };

  toast.innerHTML = `
    <div class="toast-icon">${icons[type]}</div>
    <div class="toast-content">
      <div class="toast-title">${_escapeHtml(labels[type])}</div>
      <div class="toast-message">${_escapeHtml(message)}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.classList.add('removing'); setTimeout(() => this.parentElement.remove(), 400)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  container.appendChild(toast);

  // Auto remove
  const duration = 3500;
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ==================== MODAL ALERTS ====================
/**
 * Display a premium modal alert
 * @param {string} title - The title of the alert
 * @param {string} message - The message body
 * @param {string} type - success, error, warning, info
 */
function showAlert(title, message, type = 'info') {
  // Check if an alert modal already exists
  let modal = document.getElementById('globalAlertModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'globalAlertModal';
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) closeAlert(); };
    document.body.appendChild(modal);
  }

  const icons = {
    success: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  const colors = {
    success: 'var(--success)',
    error: 'var(--danger)',
    warning: 'var(--warning)',
    info: 'var(--accent)'
  };

  modal.innerHTML = `
    <div class="modal" style="max-width: 400px; text-align: center;">
      <div class="modal-body" style="padding: 40px 32px;">
        <div class="confirm-icon" style="color: ${colors[type]}; background: ${colors[type]}15; width: 72px; height: 72px; margin: 0 auto 24px;">
          ${icons[type]}
        </div>
        <h3 style="font-size: 20px; font-weight: 800; margin-bottom: 12px; color: var(--text-primary);">${_escapeHtml(title)}</h3>
        <p style="font-size: 14px; line-height: 1.6; color: var(--text-secondary); margin-bottom: 32px;">${_escapeHtml(message)}</p>
        <button class="btn-confirm-danger" onclick="closeAlert()" style="background: ${type === 'error' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'var(--accent-gradient)'}; min-width: 140px; box-shadow: 0 4px 14px ${colors[type]}40;">
          ${typeof t === 'function' ? t('confirm') : 'OK'}
        </button>
      </div>
    </div>
  `;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAlert() {
  const modal = document.getElementById('globalAlertModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}
