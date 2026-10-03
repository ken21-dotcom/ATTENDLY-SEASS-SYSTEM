/* ============================================================
   Authentication — login, logout, session guard
   ------------------------------------------------------------
   Handles the login form, demo-account shortcuts, password
   visibility toggle, and the hero carousel on the login page.
   Credentials are verified against the PHP backend when API_BASE_URL
   is set in api.js; with no backend configured the app falls back to
   the localStorage mock data so the prototype runs standalone.
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
 * Called from every page's "Log out" button. When the backend is
 * configured the server session is ended too, though the local
 * redirect never waits on it.
 */
function logout() {
  if (API_BASE_URL) {
    api.logout();
    // The cache now holds database rows, so drop it and reseed the demo
    // dataset. Without this the offline prototype would come back with
    // whatever the last session happened to have loaded.
    if (typeof resetDemoData === 'function') resetDemoData();
  }
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
 * Validate credentials and redirect on success. Shows a toast on failure.
 *
 * When API_BASE_URL is configured the check runs against the PHP backend
 * (bcrypt + server session). Otherwise it falls back to the localStorage
 * mock data so the prototype still runs with no database.
 *
 * @param {string} email
 * @param {string} password
 */
async function loginWithCredentials(email, password) {
  var redirectFor = function (user) {
    showToast('success', 'Login successful! Redirecting...');
    setTimeout(function () {
      window.location.href = pageUrl(user.role);
    }, 700);
  };

  if (API_BASE_URL) {
    try {
      var user = await api.login(email, password);
      // Cache the safe user record so role pages can render immediately;
      // the authoritative session lives in the PHP cookie.
      setSession(user);

      // Pull the database's data into the localStorage cache the pages read.
      // If some collections fail we say so rather than letting demo data
      // pass for real data.
      var hydration = await hydrateFromApi();
      if (hydration.failed.length) {
        showToast('error', 'Could not load from the server: ' + hydration.failed.join(', ') +
          '. Showing locally cached data for those.');
      }

      redirectFor(user);
      return;
    } catch (error) {
      // A rejected login is a real answer from the server — report it
      // rather than silently retrying against local data.
      if (error.code !== 'network_error' && error.code !== 'invalid_response') {
        showToast('error', error.message);
        return;
      }
      // Backend unreachable: fall through to the offline path below.
    }
  }

  var users = getUsers();
  // Stored passwords are SHA-256 digests (see data.js hashPassword); the typed
  // password is hashed at compare time so plaintext never touches storage.
  var localUser = users.find(u => u.email === email && passwordMatches(password, u.password));

  if (!localUser) {
    showToast('error', 'Invalid email or password');
    return;
  }

  setSession(localUser);
  redirectFor(localUser);
}


/* ============================================================
   Account registration — the sign-up page
   ------------------------------------------------------------
   Self-registration creates student accounts only. Officer and
   administrator accounts are issued by an administrator from
   admin-manage-officers, so there is deliberately no role choice here.

   Like the rest of the app's writes this is local-only: there is no
   signup endpoint, and POST /users/students requires a student ID
   number and section that this form does not ask for (see the sync
   matrix in api.js). Inventing those would put fabricated identity
   data into the database.
   ============================================================ */

/** Minimum password length accepted at sign-up. */
var SIGNUP_PASSWORD_MIN = 8;

/**
 * Score a password 0–4 for the strength meter.
 * 0 is empty, 1 is below the length floor, and 2–4 count how many of
 * the four character classes (lower, upper, digit, symbol) are present.
 *
 * @param {string} value
 * @returns {number} 0–4
 */
function scorePassword(value) {
  if (!value) return 0;
  if (value.length < SIGNUP_PASSWORD_MIN) return 1;

  var classes = 0;
  if (/[a-z]/.test(value)) classes++;
  if (/[A-Z]/.test(value)) classes++;
  if (/\d/.test(value)) classes++;
  if (/[^A-Za-z0-9]/.test(value)) classes++;

  return Math.min(4, 1 + classes);
}

/**
 * Create a student account and sign the new student in.
 *
 * @param {{name: string, email: string, password: string,
 *          department?: string, course?: string, yearLevel?: string}} details
 * @returns {boolean} true when the account was created
 */
function registerAccount(details) {
  var name     = String(details.name || '').trim();
  var email    = String(details.email || '').trim().toLowerCase();
  var password = String(details.password || '');

  var users = getUsers();
  var taken = users.some(function (u) {
    return String(u.email || '').toLowerCase() === email;
  });

  if (taken) {
    showToast('error', 'An account with that email already exists.');
    return false;
  }

  // Same shape as a seeded student record (data.js getDemoStudentCohort):
  // a hashed password, never plaintext, and org fields defaulted to
  // UNASSIGNED so grouping in the student lists always has a bucket.
  var account = {
    id:         generateId('stu'),
    name:       name,
    email:      email,
    password:   hashPassword(password),
    role:       'student',
    department: details.department || UNASSIGNED,
    course:     details.course || UNASSIGNED,
    yearLevel:  details.yearLevel || UNASSIGNED,
  };

  setUsers(users.concat([account]));
  setSession(account);

  showToast('success', 'Account created! Redirecting...');
  setTimeout(function () {
    window.location.href = pageUrl(account.role);
  }, 700);

  return true;
}


/* ============================================================
   DOMContentLoaded — login and sign-up page initialisation
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
  // ── Already signed in? Skip the auth screens. ──
  // Without this, a signed-in user can sign up again and silently create
  // a second account while a session is already open for the first one.
  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    const signedIn = getCurrentUser();
    if (signedIn) {
      window.location.replace(pageUrl(signedIn.role));
      return;
    }
  }

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

  // ── Password visibility toggles (eye / eye-slash) ──
  // Wired per .input-group-password group rather than by id, so the sign-up
  // page's two password fields get the same behaviour as the login page's one
  // without duplicating the handler.
  document.querySelectorAll('.input-group-password').forEach(function (group) {
    const field = group.querySelector('input');
    const toggle = group.querySelector('.auth-password-toggle');
    const icon = toggle && toggle.querySelector('i');
    if (!field || !toggle || !icon) return;

    toggle.addEventListener('click', function () {
      const show = field.type === 'password';
      field.type = show ? 'text' : 'password';
      icon.className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      toggle.setAttribute('aria-pressed', String(show));

      // Brief "flick" cue — pick up, swap, settle.
      toggle.classList.add('is-switching');
      setTimeout(function () { toggle.classList.remove('is-switching'); }, 160);
    });
  });

  // ── Sign-up page ──
  if (signupForm) {
    const nameField     = document.getElementById('signup-name-field');
    const emailField    = document.getElementById('signup-email-field');
    const passwordField = document.getElementById('signup-password-field');
    const confirmField  = document.getElementById('signup-confirm-field');
    const termsBox      = document.getElementById('signup-terms');
    const meter         = document.getElementById('signupStrength');
    const meterLabel    = document.getElementById('signupStrengthLabel');

    // Reuse the shared department → course → year cascade from ui.js, so
    // sign-up offers exactly the taxonomy the student lists group by.
    initOrgModalSelects('signupDepartment', 'signupCourse', 'signupYear');

    // One label per score, 0–4. scorePassword returns 1 + (character-class
    // count) for anything long enough, so 0 is empty, 1 is below the length
    // floor, 2 is a single class, 3 is two, and 4 is three or more.
    const PASSWORD_HELPER_TEXT = '8+ characters required with a letter and number';
    const STRENGTH_LABELS = [
      PASSWORD_HELPER_TEXT,
      'Too short',
      'Weak',
      'Fair',
      'Strong',
    ];

    /** Repaint the strength meter from the current password value. */
    function updateStrengthMeter() {
      const level = scorePassword(passwordField.value);
      meter.dataset.level = String(level);
      meterLabel.textContent = STRENGTH_LABELS[level];
    }

    // Mark a field invalid, or clear the mark if it is now valid.
    function setFieldState(field, ok) {
      if (!field) return;
      field.classList.toggle('is-invalid', !ok);
    }

    // Live re-validation: once a field has been marked, correct it as the
    // user fixes it rather than making them submit again to find out.
    function revalidate(field, isValid) {
      if (field.classList.contains('is-invalid')) setFieldState(field, isValid());
    }

    nameField.addEventListener('blur', function () {
      setFieldState(nameField, nameField.value.trim().length > 0);
    });
    nameField.addEventListener('input', function () {
      revalidate(nameField, function () { return nameField.value.trim().length > 0; });
    });

    emailField.addEventListener('blur', function () {
      setFieldState(emailField, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailField.value.trim()));
    });
    emailField.addEventListener('input', function () {
      revalidate(emailField, function () {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailField.value.trim());
      });
    });

    passwordField.addEventListener('blur', function () {
      setFieldState(passwordField, scorePassword(passwordField.value) >= 2);
    });
    passwordField.addEventListener('input', function () {
      updateStrengthMeter();
      revalidate(passwordField, function () {
        return scorePassword(passwordField.value) >= 2;
      });
      revalidate(confirmField, function () {
        return confirmField.value === passwordField.value;
      });
    });

    confirmField.addEventListener('blur', function () {
      setFieldState(confirmField, confirmField.value.length > 0 && confirmField.value === passwordField.value);
    });
    confirmField.addEventListener('input', function () {
      revalidate(confirmField, function () {
        return confirmField.value === passwordField.value;
      });
    });

    termsBox.addEventListener('blur', function () {
      setFieldState(termsBox, termsBox.checked);
    });
    termsBox.addEventListener('change', function () {
      revalidate(termsBox, function () { return termsBox.checked; });
    });

    signupForm.addEventListener('submit', function (e) {
      e.preventDefault();

      const password = passwordField.value;
      const confirm  = confirmField.value;

      setFieldState(nameField,  nameField.value.trim().length > 0);
      setFieldState(emailField, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailField.value.trim()));
      setFieldState(passwordField, scorePassword(password) >= 2);
      setFieldState(confirmField,  confirm.length > 0 && confirm === password);
      setFieldState(termsBox,      termsBox.checked);

      // Focus the first field still marked invalid, so keyboard and screen
      // reader users land on the problem instead of hunting for it.
      // No smooth behavior: this page honours prefers-reduced-motion.
      const firstInvalid = signupForm.querySelector('.is-invalid');
      if (firstInvalid) {
        firstInvalid.focus();
        if (firstInvalid.scrollIntoView) {
          firstInvalid.scrollIntoView({ block: 'center' });
        }
        return;
      }

      registerAccount({
        name:       nameField.value,
        email:      emailField.value,
        password:   password,
        department: document.getElementById('signupDepartment').value,
        course:     document.getElementById('signupCourse').value,
        yearLevel:  document.getElementById('signupYear').value,
      });
    });

    updateStrengthMeter();
  }



  // ── Hero carousel ──
  // Story-style autoplay: one slim progress segment per slide. The active
  // segment's fill animates empty→full over the dwell time (heroProgressFill,
  // 5s linear) and its animationend drives the advance to the next slide, so
  // the JS stays in lock-step with the CSS fill — no timer drift. Finished
  // segments hold solid, upcoming ones show only a dim track, and hovering
  // the hero pauses the current fill in place. Clicks and arrows restart the
  // active segment's fill from empty.
  //
  // Navigation is arrows-only: there is no play/pause control. Autoplay runs
  // continuously and stops only while the pointer is over the hero or focus
  // is inside it, then resumes on leave.
  (function () {
    const bgSlides      = document.querySelectorAll('.auth-hero-slide');
    const slideContents = document.querySelectorAll('.auth-hero-slide-content');
    const indicators    = document.querySelectorAll('.auth-hero-progress');
    const indicatorsBox = document.querySelector('.auth-hero-indicators');
    const slideNum      = document.querySelector('.auth-hero-slide-num');
    const prevBtn       = document.getElementById('heroPrev');
    const nextBtn       = document.getElementById('heroNext');
    const hero          = document.querySelector('.auth-hero');

    let current    = 0;
    const total    = slideContents.length;
    const DWELL_MS = 5000; // keep in sync with heroProgressFill duration in auth.css
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let autoTimer  = null; // reduced-motion fallback only
    let isPaused   = false; // hover / focus only — there is no manual pause control

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
      isPaused = false;
      setPlayState('running');
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

    // Pause autoplay while hovering the hero so it doesn't fight manual
    // navigation. Autoplay resumes on leave — there is no manual pause control.
    if (hero) {
      hero.addEventListener('mouseenter', pauseAuto);
      hero.addEventListener('mouseleave', resumeAuto);
      hero.addEventListener('focusin', pauseAuto);
      hero.addEventListener('focusout', function (event) {
        if (!hero.contains(event.relatedTarget)) resumeAuto();
      });
    }

    goToSlide(current, true);
  })();
});
