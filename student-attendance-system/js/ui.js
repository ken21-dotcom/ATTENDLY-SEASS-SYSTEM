// UI utilities: toast, modal, empty states, etc.

function showToast(type, message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toastEl = document.createElement('div');
  const variantClass = type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : 'toast-info';
  toastEl.className = `toast align-items-center border-0 ${variantClass}`;
  toastEl.setAttribute('role', 'alert');
  toastEl.style.marginBottom = '0.5rem';
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button>
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

// Theme management
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcons(newTheme);
}

function updateThemeIcons(theme) {
  const icons = document.querySelectorAll('[data-theme-icon]');
  icons.forEach(icon => {
    icon.className = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon';
  });
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', function() {
  initTheme();
  updateThemeIcons(document.documentElement.getAttribute('data-theme') || 'light');

  // Add click handler for theme toggle buttons
  document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
    btn.addEventListener('click', toggleTheme);
  });
});

// Format date for display
function formatDate(dateStr) {
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateStr).toLocaleDateString(undefined, options);
}

// Get severity badge HTML
function severityBadge(severity) {
  const map = {
    warning: 'badge-warning-severity',
    probation: 'badge-probation-severity',
    suspension: 'badge-suspension-severity'
  };
  const cls = map[severity] || 'bg-secondary';
  return `<span class="badge ${cls}">${severity.charAt(0).toUpperCase() + severity.slice(1)}</span>`;
}

// Toggle empty state
function toggleEmptyState(containerId, hasData) {
  const empty = document.getElementById(containerId);
  if (empty) {
    empty.classList.toggle('d-none', hasData);
  }
}