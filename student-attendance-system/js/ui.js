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


/* ============================================================
   Grouped Student List (Department → Course → Year Level)
   ------------------------------------------------------------
   Shared by the SSC and Admin "Manage Students" pages. Renders the
   student table as collapsible department + course sections (Year
   Level stays a column so rows stay compact), backed by the three
   org filter dropdowns and a name/ID/email search box. Each page
   supplies a renderRow(student) callback for its own columns — the
   grouping / filter / collapse behaviour lives here.
   ============================================================ */

/**
 * Initialise the grouped, filterable student list on a manage-students
 * page: populate the filter dropdowns, wire search + collapse, render
 * into the table body. Re-render later via refreshGroupedStudentList().
 *
 * @param {object} opts
 * @param {string}   [opts.tbodyId='studentTableBody']
 * @param {string}   [opts.countId='studentCount']
 * @param {string}   [opts.departmentFilterId='filterDepartment']
 * @param {string}   [opts.courseFilterId='filterCourse']
 * @param {string}   [opts.yearFilterId='filterYear']
 * @param {string}   [opts.searchId='studentSearch']
 * @param {number}   [opts.colspan=5]
 * @param {function(object):string} opts.renderRow — returns the cell HTML for one student row
 */
function initGroupedStudentList(opts) {
  const tbody = document.getElementById(opts.tbodyId || 'studentTableBody');
  if (!tbody) return;

  const deptSel   = document.getElementById(opts.departmentFilterId || 'filterDepartment');
  const courseSel = document.getElementById(opts.courseFilterId   || 'filterCourse');
  const yearSel   = document.getElementById(opts.yearFilterId     || 'filterYear');
  const searchEl  = document.getElementById(opts.searchId         || 'studentSearch');
  const colspan   = opts.colspan || 5;
  const taxonomy  = getStudentOrgTaxonomy();

  // ── Filter dropdown options ──
  if (deptSel) {
    deptSel.innerHTML = '<option value="">All Departments</option>' +
      taxonomy.departments.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('') +
      `<option value="${UNASSIGNED}">${UNASSIGNED}</option>`;
  }
  if (yearSel) {
    yearSel.innerHTML = '<option value="">All Year Levels</option>' +
      taxonomy.yearLevels.map(y => `<option value="${y}">${escapeHtml(getStudentYearLabel(y))}</option>`).join('') +
      `<option value="${UNASSIGNED}">${UNASSIGNED}</option>`;
  }

  // Course options follow the currently selected Department.
  function fillCourseOptions(selectedDept) {
    if (!courseSel) return;
    let courses;
    if (!selectedDept) {
      courses = [];
      Object.values(taxonomy.coursesByDept).forEach(list => list.forEach(c => courses.push(c)));
      courses.push(UNASSIGNED);
    } else if (selectedDept === UNASSIGNED) {
      courses = [UNASSIGNED];
    } else {
      courses = taxonomy.coursesByDept[selectedDept] || [];
    }
    courseSel.innerHTML = '<option value="">All Courses</option>' +
      courses.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  }

  function readState() {
    return {
      department: deptSel   ? deptSel.value  : '',
      course:     courseSel ? courseSel.value : '',
      yearLevel:  yearSel   ? yearSel.value  : '',
      query:      searchEl  ? searchEl.value : '',
    };
  }

  function render() {
    const state   = readState();
    const all     = getUsers().filter(u => u.role === 'student');
    const visible = applyStudentFilters(all, state, state.query);

    const countEl = document.getElementById(opts.countId || 'studentCount');
    if (countEl) countEl.textContent = `${visible.length} of ${all.length} students`;

    tbody.innerHTML = '';

    if (!visible.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="${colspan}" class="text-center text-muted py-4">` +
        '<i class="bi bi-people fs-5 me-2"></i>No students match the current filters.</td>';
      tbody.appendChild(tr);
      return;
    }

    groupStudentsByOrg(visible).forEach(group => {
      const studentCount = group.courses.reduce((n, c) => n + c.students.length, 0);
      tbody.appendChild(makeOrgHeadRow(group.department, `${group.courses.length} course${group.courses.length === 1 ? '' : 's'} · ${studentCount} student${studentCount === 1 ? '' : 's'}`, colspan, 'dept'));
      group.courses.forEach(courseGroup => {
        tbody.appendChild(makeOrgHeadRow(courseGroup.course, `${courseGroup.students.length} student${courseGroup.students.length === 1 ? '' : 's'}`, colspan, 'course'));
        courseGroup.students.forEach(student => {
          const tr = document.createElement('tr');
          tr.dataset.kind = 'student';
          tr.innerHTML = opts.renderRow(student);
          tbody.appendChild(tr);
        });
      });
    });
  }

  // Collapse/expand everything below a department or course header.
  function toggleGroup(headRow) {
    const level = headRow.dataset.level; // 'dept' | 'course'
    const willCollapse = !headRow.classList.contains('org-group-collapsed');
    headRow.classList.toggle('org-group-collapsed', willCollapse);
    headRow.setAttribute('aria-expanded', String(!willCollapse));
    let node = headRow.nextElementSibling;
    while (node) {
      if (node.dataset.kind === 'org-head') {
        // Stop at the next department head (after a dept header) or the
        // next course/department head (after a course header).
        if (level === 'course' || node.dataset.level === 'dept') break;
      }
      node.classList.toggle('org-group-hidden', willCollapse);
      node = node.nextElementSibling;
    }
  }

  tbody.addEventListener('click', (e) => {
    const head = e.target.closest && e.target.closest('.org-group-head');
    if (head) toggleGroup(head);
  });
  tbody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const head = e.target.closest && e.target.closest('.org-group-head');
    if (head) { e.preventDefault(); toggleGroup(head); }
  });

  // ── Filter + search wiring ──
  if (deptSel) deptSel.addEventListener('change', () => {
    fillCourseOptions(deptSel.value);
    // A course picked under the previous department may no longer exist.
    if (courseSel && courseSel.value && !courseSel.querySelector(`option[value="${courseSel.value}"]`)) {
      courseSel.value = '';
    }
    render();
  });
  if (courseSel) courseSel.addEventListener('change', render);
  if (yearSel)   yearSel.addEventListener('change', render);
  if (searchEl)  searchEl.addEventListener('input', render);

  fillCourseOptions(deptSel ? deptSel.value : '');
  render();

  // Expose a re-render hook so add/edit/delete handlers can refresh.
  window.__refreshStudentList = render;
}

/** Re-render the grouped student list with the current filter state. */
function refreshGroupedStudentList() {
  if (typeof window.__refreshStudentList === 'function') window.__refreshStudentList();
}

/**
 * Build a collapsible department (level 'dept') or course (level
 * 'course') header row spanning every column.
 */
function makeOrgHeadRow(title, pillText, colspan, level) {
  const tr = document.createElement('tr');
  tr.dataset.kind  = 'org-head';
  tr.dataset.level = level;
  tr.className = 'org-group-head ' + (level === 'dept' ? 'org-group-head-dept' : 'org-group-head-course');
  tr.setAttribute('role', 'button');
  tr.setAttribute('tabindex', '0');
  tr.setAttribute('aria-expanded', 'true');
  const icon = level === 'dept' ? 'bi-buildings-fill' : 'bi-journal-text';
  tr.innerHTML =
    `<td colspan="${colspan}">` +
      '<div class="org-group-label">' +
        '<span class="org-group-chevron"><i class="bi bi-chevron-down"></i></span>' +
        `<i class="bi ${icon} org-group-icon"></i>` +
        `<span class="org-group-title">${escapeHtml(title)}</span>` +
        `<span class="org-group-pill">${escapeHtml(pillText)}</span>` +
      '</div>' +
    '</td>';
  return tr;
}

/**
 * Populate the Department/Course/Year selects inside Add/Edit student
 * modals; the course options follow the selected department. Pass an
 * optional `initial` record to pre-fill existing values for editing.
 *
 * @returns {{ deptSel: HTMLSelectElement, courseSel: HTMLSelectElement, yearSel: HTMLSelectElement }}
 */
function initOrgModalSelects(deptId, courseId, yearId, initial) {
  const deptSel   = document.getElementById(deptId);
  const courseSel = courseId ? document.getElementById(courseId) : null;
  const yearSel   = document.getElementById(yearId);
  const init      = initial || {};
  const taxonomy  = getStudentOrgTaxonomy();

  function fillDepartment(value) {
    if (!deptSel) return;
    deptSel.innerHTML = '<option value="">Select department…</option>' +
      taxonomy.departments.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('') +
      `<option value="${UNASSIGNED}">${UNASSIGNED}</option>`;
    deptSel.value = value || '';
  }

  function fillCourse(department, value) {
    if (!courseSel) return;
    const courses = department
      ? (department === UNASSIGNED ? [UNASSIGNED] : (taxonomy.coursesByDept[department] || []))
      : [];
    courseSel.innerHTML = '<option value="">Select course…</option>' +
      courses.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    courseSel.value = value || '';
  }

  function fillYear(value) {
    if (!yearSel) return;
    yearSel.innerHTML = '<option value="">Select year…</option>' +
      taxonomy.yearLevels.map(y => `<option value="${y}">${escapeHtml(getStudentYearLabel(y))}</option>`).join('');
    yearSel.value = value || '';
  }

  fillDepartment(init.department);
  fillCourse(init.department, init.course);
  fillYear(init.yearLevel);

  if (deptSel && courseSel) {
    deptSel.addEventListener('change', () => { courseSel.value = ''; fillCourse(deptSel.value); });
  }

  return { deptSel, courseSel, yearSel };
}

/**
 * Year Level badge HTML for a student row in a grouped list.
 * @returns {string}
 */
function yearBadge(student) {
  const org      = normalizeStudentOrg(student);
  const assigned = org.yearLevel !== UNASSIGNED;
  const cls      = assigned ? 'year-badge' : 'year-badge year-unassigned';
  const label    = assigned ? getStudentYearLabel(org.yearLevel) : UNASSIGNED;
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}