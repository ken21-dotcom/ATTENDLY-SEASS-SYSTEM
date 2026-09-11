/* ============================================================
   Authentication — login, logout, session guard
   ------------------------------------------------------------
   Handles the login form, demo-account shortcuts, password
   visibility toggle, and the hero carousel on the login page.
   All credential checks run against localStorage mock data;
   production would use a server-side auth endpoint.
   ============================================================ */

/**
 * Destroy the current session and return to the login page.
 * Called from every page's "Log out" button.
 */
function logout() {
  clearSession();
  window.location.href = 'login.html';
}

/**
 * Guard that ensures the current user is authenticated and
 * optionally has the required role. Redirects to the
 * appropriate page when the check fails.
 *
 * @param {string|string[]|null} role — allowed role(s); null = any
 * @returns {object|null} the current user, or null on redirect
 */
function requireAuth(role = null) {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }

  const roleAllowed = Array.isArray(role)
    ? role.includes(user.role)
    : user.role === role;

  if (role && !roleAllowed) {
    switch (user.role) {
      case 'student':     window.location.href = 'student-dashboard.html'; break;
      case 'ssc-officer': window.location.href = 'ssc-dashboard.html';    break;
      default:            window.location.href = 'login.html';
    }
    return null;
  }
  return user;
}

/**
 * Validate credentials against the users collection and
 * redirect on success. Shows a toast on failure.
 *
 * @param {string} email
 * @param {string} password
 */
function loginWithCredentials(email, password) {
  const users = getUsers();
  const user  = users.find(u => u.email === email && u.password === password);

  if (!user) {
    showToast('error', 'Invalid email or password');
    return;
  }

  setSession(user);
  showToast('success', 'Login successful! Redirecting...');
  setTimeout(() => {
    switch (user.role) {
      case 'student':     window.location.href = 'student-dashboard.html'; break;
      case 'ssc-officer': window.location.href = 'ssc-dashboard.html';    break;
    }
  }, 700);
}


/* ============================================================
   DOMContentLoaded — login page initialisation
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
  // ── Demo account quick-login buttons ──
  document.querySelectorAll('[data-demo-email]').forEach(function (button) {
    button.addEventListener('click', function () {
      loginWithCredentials(button.dataset.demoEmail, 'password123');
    });
  });

  // ── Login form submission ──
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const email    = document.getElementById('login-email-field').value.trim();
      const password = document.getElementById('login-password-field').value.trim();
      loginWithCredentials(email, password);
    });
  }

  // ── Password visibility toggle (eye / eye-slash) ──
  const passwordToggle     = document.getElementById('passwordToggle');
  const passwordField      = document.getElementById('login-password-field');
  const passwordToggleIcon = document.getElementById('passwordToggleIcon');

  if (passwordToggle && passwordField && passwordToggleIcon) {
    passwordToggle.addEventListener('click', function () {
      const show = passwordField.type === 'password';
      passwordField.type = show ? 'text' : 'password';
      passwordToggleIcon.className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
      passwordToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');

      // Brief "flick" cue — pick up, swap, settle.
      passwordToggle.classList.add('is-switching');
      setTimeout(function () { passwordToggle.classList.remove('is-switching'); }, 160);
    });
  }

  // ── Hero carousel ──
  // Vanilla-JS autoplay with progress-bar indicators. The active
  // indicator is an elongated pill whose fill bar animates
  // left→right over the dwell time (heroProgressFill, 5s in CSS).
  // The autoplay timer advances when the fill completes; hover pauses both.
  (function () {
    const slideContents = document.querySelectorAll('.auth-hero-slide-content');
    const indicators    = document.querySelectorAll('.auth-hero-progress');
    const slideNum      = document.querySelector('.auth-hero-slide-num');
    const prevBtn       = document.getElementById('heroPrev');
    const nextBtn       = document.getElementById('heroNext');
    const hero          = document.querySelector('.auth-hero');

    let current   = 0;
    const total   = slideContents.length;
    const DWELL_MS = 5000; // keep in sync with heroProgressFill duration in auth.css
    let autoTimer = null;
    let isPaused  = false;

    /** Sync indicator fills — the active one gets a restart. */
    function setIndicatorFill(idx) {
      indicators.forEach(function (ind, i) {
        ind.classList.toggle('active', i === idx);
        const fill = ind.querySelector('.auth-hero-progress-fill');
        if (fill) {
          fill.style.animation = 'none';
          void fill.offsetWidth; // reflow to restart animation from 0
          fill.style.animation = '';
        }
      });
    }

    /**
     * Advance to a specific slide. Wraps around at both ends.
     * @param {number} index
     * @param {boolean} restart — true to reset the autoplay timer
     */
    function goToSlide(index, restart) {
      if (index < 0) index = total - 1;
      if (index >= total) index = 0;

      slideContents[current].classList.remove('active');
      current = index;
      slideContents[current].classList.add('active');
      setIndicatorFill(current);
      if (slideNum) slideNum.textContent = String(current + 1).padStart(2, '0');
      if (restart) startAuto();
    }

    function startAuto() {
      stopAuto();
      isPaused = false;
      indicators.forEach(function (ind) { ind.classList.remove('paused'); ind.classList.add('running'); });
      autoTimer = setInterval(function () {
        if (!isPaused) goToSlide(current + 1, true);
      }, DWELL_MS);
    }

    function stopAuto() {
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    }

    function pauseAuto() {
      if (autoTimer && !isPaused) {
        isPaused = true;
        indicators.forEach(function (ind) { ind.classList.remove('running'); ind.classList.add('paused'); });
      }
    }

    function resumeAuto() {
      if (autoTimer && isPaused) {
        isPaused = false;
        indicators.forEach(function (ind) { ind.classList.remove('paused'); ind.classList.add('running'); });
      }
    }

    // Indicator click → jump to slide
    indicators.forEach(function (ind) {
      ind.addEventListener('click', function () {
        goToSlide(parseInt(ind.dataset.slide, 10), true);
      });
    });

    // Arrow buttons
    if (prevBtn) prevBtn.addEventListener('click', function () { goToSlide(current - 1, true); });
    if (nextBtn) nextBtn.addEventListener('click', function () { goToSlide(current + 1, true); });

    // Pause autoplay while hovering the hero so it doesn't fight manual navigation
    if (hero) {
      hero.addEventListener('mouseenter', pauseAuto);
      hero.addEventListener('mouseleave', resumeAuto);
    }

    setIndicatorFill(current);
    startAuto();
  })();
});