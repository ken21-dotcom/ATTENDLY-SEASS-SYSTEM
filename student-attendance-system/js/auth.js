/* ============================================================
   Authentication — login, logout, session guard
   ------------------------------------------------------------
   Handles the login form, demo-account shortcuts, password
   visibility toggle, and the hero carousel on the login page.
   All credential checks run against localStorage mock data;
   production would use a server-side auth endpoint.
   ============================================================ */

/**
 * Resolve the app's root folder from this script's own location.
 * auth.js is always loaded as "<app-root>/js/auth.js", regardless of
 * which subfolder the host page lives in — so the app root is simply
 * the script's path with "/js/auth.js" stripped off. This keeps page
 * redirects working now that role pages live in subfolders.
 * @type {string} trailing-slash app root, e.g. ".../student-attendance-system/"
 */
var APP_BASE = (function () {
  var scripts = document.getElementsByTagName('script');
  var src = '';
  for (var i = scripts.length - 1; i >= 0; i--) {
    if (/\/js\/(auth|data)\.js$/.test(scripts[i].src)) { src = scripts[i].src; break; }
  }
  if (!src) src = scripts[scripts.length - 1] ? scripts[scripts.length - 1].src : '';
  return src.slice(0, src.lastIndexOf('/js/')) + '/';
})();

/**
 * Absolute URL of a key page inside the app. Role pages were
 * reorganised into subfolders, so each dashboard lives one level
 * under pages/. login and kiosk stay at the pages root.
 * @param {'login'|'student'|'ssc-officer'|'admin'} role
 * @returns {string}
 */
function pageUrl(role) {
  var P = APP_BASE + 'pages/';
  switch (role) {
    case 'login':       return P + 'login.html';
    case 'student':     return P + 'student/student-dashboard.html';
    case 'ssc-officer': return P + 'ssc-officer/ssc-dashboard.html';
    case 'admin':       return P + 'administrator/admin-dashboard.html';
    default:            return P + 'login.html';
  }
}

/**
 * Destroy the current session and return to the login page.
 * Called from every page's "Log out" button.
 */
function logout() {
  clearSession();
  window.location.href = pageUrl('login');
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
    window.location.href = pageUrl('login');
    return null;
  }

  const roleAllowed = Array.isArray(role)
    ? role.includes(user.role)
    : user.role === role;

  if (role && !roleAllowed) {
    switch (user.role) {
      case 'student':     window.location.href = pageUrl('student'); break;
      case 'ssc-officer': window.location.href = pageUrl('ssc-officer'); break;
      case 'admin':       window.location.href = pageUrl('admin'); break;
      default:            window.location.href = pageUrl('login');
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
  // Stored passwords are SHA-256 digests (see data.js hashPassword); the typed
  // password is hashed at compare time so plaintext never touches storage.
  const user  = users.find(u => u.email === email && passwordMatches(password, u.password));

  if (!user) {
    showToast('error', 'Invalid email or password');
    return;
  }

  setSession(user);
  showToast('success', 'Login successful! Redirecting...');
  setTimeout(() => {
    switch (user.role) {
      case 'student':     window.location.href = pageUrl('student'); break;
      case 'ssc-officer': window.location.href = pageUrl('ssc-officer'); break;
      case 'admin':       window.location.href = pageUrl('admin'); break;
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
  // Story-style autoplay: one slim progress segment per slide. The active
  // segment's fill animates empty→full over the dwell time (heroProgressFill,
  // 5s linear) and its animationend drives the advance to the next slide, so
  // the JS stays in lock-step with the CSS fill — no timer drift. Finished
  // segments hold solid, upcoming ones show only a dim track, and hovering
  // the hero pauses the current fill in place. Clicks and arrows restart the
  // active segment's fill from empty.
  (function () {
    const bgSlides      = document.querySelectorAll('.auth-hero-slide');
    const slideContents = document.querySelectorAll('.auth-hero-slide-content');
    const indicators    = document.querySelectorAll('.auth-hero-progress');
    const indicatorsBox = document.querySelector('.auth-hero-indicators');
    const slideNum      = document.querySelector('.auth-hero-slide-num');
    const prevBtn       = document.getElementById('heroPrev');
    const nextBtn       = document.getElementById('heroNext');
    const pauseBtn      = document.getElementById('heroPause');
    const hero          = document.querySelector('.auth-hero');

    let current    = 0;
    const total    = slideContents.length;
    const DWELL_MS = 5000; // keep in sync with heroProgressFill duration in auth.css
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let autoTimer  = null; // reduced-motion fallback only
    let isPaused   = false;
    let isManuallyPaused = false;

    /** Restart a segment's fill so it starts empty again. */
    function restartFill(ind) {
      const fill = ind.querySelector('.auth-hero-progress-fill');
      if (!fill) return;
      fill.style.animation = 'none';
      void fill.offsetWidth; // reflow to restart the animation from 0
      fill.style.animation = '';
    }

    /** Animate the two-digit slide counter instead of replacing its wrapper. */
    function updateSlideNumber(index) {
      if (!slideNum) return;
      const nextValue = String(index + 1).padStart(2, '0');
      const currentNumber = slideNum.querySelector('.auth-hero-slide-num-inner.current');
      if (currentNumber && currentNumber.textContent === nextValue) return;

      slideNum.querySelectorAll('.auth-hero-slide-num-inner:not(.current)').forEach(function (number) {
        number.remove();
      });

      if (reduceMotion) {
        slideNum.innerHTML = `<span class="auth-hero-slide-num-inner current">${nextValue}</span>`;
        return;
      }

      if (currentNumber) {
        currentNumber.classList.remove('current');
        currentNumber.classList.add('exit-up');
      }

      const nextNumber = document.createElement('span');
      nextNumber.className = 'auth-hero-slide-num-inner enter-down';
      nextNumber.textContent = nextValue;
      slideNum.appendChild(nextNumber);

      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          nextNumber.classList.remove('enter-down');
          nextNumber.classList.add('current');
        });
      });

      window.setTimeout(function () {
        if (currentNumber) currentNumber.remove();
      }, 460);
    }

    /**
     * Advance to a specific slide. Wraps around at both ends.
     * @param {number} index
     * @param {boolean} restart — true to reset the autoplay timing
     */
    function goToSlide(index, restart) {
      if (index < 0) index = total - 1;
      if (index >= total) index = 0;

      if (bgSlides[current]) bgSlides[current].classList.remove('active');
      if (slideContents[current]) slideContents[current].classList.remove('active');

      current = index;
      if (bgSlides[current]) bgSlides[current].classList.add('active');
      if (slideContents[current]) slideContents[current].classList.add('active');

      indicators.forEach(function (ind, i) {
        ind.classList.toggle('active', i === current);
        ind.classList.toggle('done', i < current);
        if (i === current) ind.setAttribute('aria-current', 'step');
        else ind.removeAttribute('aria-current');
      });
      if (!reduceMotion) restartFill(indicators[current]);

      updateSlideNumber(current);
      if (restart) startAuto();
    }

    function setPlayState(state) {
      indicators.forEach(function (ind) {
        ind.classList.toggle('paused', state === 'paused');
        ind.classList.toggle('running', state === 'running');
      });
    }

    function startAuto() {
      stopAuto();
      isPaused = isManuallyPaused;
      setPlayState(isPaused ? 'paused' : 'running');
      // Reduced motion disables the CSS fill, so drive the advance with a timer.
      if (reduceMotion) {
        autoTimer = setInterval(function () {
          if (!isPaused) goToSlide(current + 1, true);
        }, DWELL_MS);
      }
    }

    function stopAuto() {
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    }

    function pauseAuto() {
      if (isPaused) return;
      isPaused = true;
      setPlayState('paused');
    }

    function resumeAuto() {
      if (!isPaused) return;
      isPaused = false;
      setPlayState('running');
    }

    function updatePauseButton() {
      if (!pauseBtn) return;
      pauseBtn.setAttribute('aria-pressed', String(isPaused));
      pauseBtn.setAttribute('aria-label', isPaused ? 'Resume slide rotation' : 'Pause slide rotation');
      pauseBtn.querySelector('i').className = isPaused ? 'bi bi-play-fill' : 'bi bi-pause-fill';
    }

    // Auto-advance fires when the active segment finishes filling.
    if (indicatorsBox) {
      indicatorsBox.addEventListener('animationend', function (e) {
        if (e.animationName !== 'heroProgressFill') return;
        if (!e.target.closest || !e.target.closest('.auth-hero-progress.active')) return;
        if (isPaused || reduceMotion) return;
        goToSlide(current + 1, true);
      });
    }

    // Indicator click → jump to that slide directly and restart its fill.
    // A brief pop on the target segment makes the jump land smoothly.
    indicators.forEach(function (ind) {
      ind.addEventListener('click', function () {
        const target = parseInt(ind.dataset.slide, 10);
        if (target !== current && !reduceMotion) {
          ind.classList.add('pop');
          setTimeout(function () { ind.classList.remove('pop'); }, 300);
        }
        goToSlide(target, true);
      });
    });

    // Arrow buttons — reset the active segment's fill via goToSlide(restart)
    if (prevBtn) prevBtn.addEventListener('click', function () { goToSlide(current - 1, true); });
    if (nextBtn) nextBtn.addEventListener('click', function () { goToSlide(current + 1, true); });
    if (pauseBtn) pauseBtn.addEventListener('click', function () {
      isManuallyPaused = !isManuallyPaused;
      if (isManuallyPaused) pauseAuto(); else resumeAuto();
      updatePauseButton();
    });

    // Pause autoplay while hovering the hero so it doesn't fight manual navigation
    if (hero) {
      hero.addEventListener('mouseenter', pauseAuto);
      hero.addEventListener('mouseleave', function () { if (!isManuallyPaused) resumeAuto(); updatePauseButton(); });
      hero.addEventListener('focusin', function () { pauseAuto(); updatePauseButton(); });
      hero.addEventListener('focusout', function (event) {
        if (!hero.contains(event.relatedTarget) && !isManuallyPaused) { resumeAuto(); updatePauseButton(); }
      });
    }

    goToSlide(current, true);
    updatePauseButton();
  })();
});
