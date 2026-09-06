// Auth logic, login/redirect, logout

function logout() {
  clearSession();
  window.location.href = 'login.html';
}

// Check if user is logged in and redirect if not
function requireAuth(role = null) {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  const roleAllowed = Array.isArray(role) ? role.includes(user.role) : user.role === role;
  if (role && !roleAllowed) {
    // Redirect to appropriate dashboard
    switch (user.role) {
      case 'student': window.location.href = 'student-dashboard.html'; break;
      case 'ssc-officer': window.location.href = 'ssc-dashboard.html'; break;
      default: window.location.href = 'login.html';
    }
    return null;
  }
  return user;
}

// Login form handler (on login page)
document.addEventListener('DOMContentLoaded', function() {
  const loginForm = document.getElementById('loginForm');
  document.querySelectorAll('[data-demo-email]').forEach(function(button) {
    button.addEventListener('click', function() {
      loginWithCredentials(button.dataset.demoEmail, 'password123');
    });
  });

  if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const email = document.getElementById('login-email-field').value.trim();
      const password = document.getElementById('login-password-field').value.trim();
      loginWithCredentials(email, password);
    });
  }
});

function loginWithCredentials(email, password) {
  const users = getUsers();
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    showToast('error', 'Invalid email or password');
    return;
  }

  setSession(user);
  showToast('success', 'Login successful! Redirecting...');
  setTimeout(() => {
    switch (user.role) {
      case 'student': window.location.href = 'student-dashboard.html'; break;
      case 'ssc-officer': window.location.href = 'ssc-dashboard.html'; break;
    }
  }, 700);
}