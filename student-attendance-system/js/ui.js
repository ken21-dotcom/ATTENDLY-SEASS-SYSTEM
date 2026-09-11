/* ============================================================
   UI Utilities — toast notifications, theme, formatting, badges
   ------------------------------------------------------------
   Shared across all pages. Provides toast popups, dark/light
   theme toggling, date formatting, severity badges, and
   empty-state helpers. The escapeHtml function is critical
   for XSS prevention — always use it before injecting user
   data into innerHTML.
   ============================================================ */

/**
 * Escape HTML special characters to prevent XSS when
 * injecting user-supplied strings into innerHTML.
 *
 * @param {*} str — value to escape (coerced to string)
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, ch => escapeMap[ch]);
}

/**
 * Display a toast notification. Falls back to a plain DOM
 * element when Bootstrap's JS is unavailable.
 *
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {string} message — plain text (not HTML)
 */
function showToast(type, message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const variantClass = type === 'success' ? 'toast-success'
                     : type === 'error'   ? 'toast-error'
                     : 'toast-info';

  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center border-0 ${variantClass}`;
  toastEl.setAttribute('role', 'alert');
  toastEl.style.marginBottom = '0.5rem';
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${escapeHtml(message)}</div>
      <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  container.appendChild(toastEl);
  if (window.bootstrap && window.bootstrap.Toast) {
    const toast = new window.bootstrap.Toast(toastEl, { delay: 3000 });
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    return;
  }

  // Keep feedback working when the optional Bootstrap CDN is unavailable.
  toastEl.style.cssText += 'display:block;padding:0.75rem 1rem;border-radius:0.375rem;';
  window.setTimeout(() => toastEl.remove(), 3000);
}

/* ============================================================
   Theme Management
   ============================================================ */

/** Read the saved theme and apply it before first paint. */
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

/** Toggle between light and dark mode, persist the choice. */
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcons(newTheme);
}

/** Sync all theme-toggle icons (moon ↔ sun) to the current theme. */
function updateThemeIcons(theme) {
  document.querySelectorAll('[data-theme-icon]').forEach(icon => {
    icon.className = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon';
  });
}

// Initialise theme on page load.
document.addEventListener('DOMContentLoaded', function () {
  initTheme();
  updateThemeIcons(document.documentElement.getAttribute('data-theme') || 'light');

  document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
    btn.addEventListener('click', toggleTheme);
  });
});


/* ============================================================
   Date & Badge Helpers
   ============================================================ */

/**
 * Format a "YYYY-MM-DD" string into a human-readable date.
 * @param {string} dateStr
 * @returns {string} e.g. "Sep 8, 2026"
 */
function formatDate(dateStr) {
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateStr).toLocaleDateString(undefined, options);
}

/**
 * Return the severity badge HTML for a sanction level.
 * @param {'warning'|'probation'|'suspension'} severity
 * @returns {string} innerHTML for a <span class="badge …">
 */
function severityBadge(severity) {
  const classMap = {
    warning:    'badge-warning-severity',
    probation:  'badge-probation-severity',
    suspension: 'badge-suspension-severity',
  };
  const cls = classMap[severity] || 'bg-secondary';
  const label = severity.charAt(0).toUpperCase() + severity.slice(1);
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

/**
 * Show or hide an empty-state container based on whether
 * data is present.
 *
 * @param {string}  containerId — DOM id of the empty-state element
 * @param {boolean} hasData     — true = hide empty state, false = show it
 */
function toggleEmptyState(containerId, hasData) {
  const empty = document.getElementById(containerId);
  if (empty) {
    empty.classList.toggle('d-none', hasData);
  }
}