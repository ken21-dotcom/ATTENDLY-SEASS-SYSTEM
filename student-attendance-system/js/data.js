/* ============================================================
   Data Layer — localStorage helpers, mock data, session management
   ------------------------------------------------------------
   All persistence for the ATTENDLY prototype runs through this
   module. Every entity (users, events, attendance, sanctions,
   etc.) has a typed get/set pair that serialises to localStorage.

   Production note: localStorage is used only for the prototype.
   A real deployment stores everything server-side and this file
   becomes a thin API-client wrapper.

   STORAGE_KEYS use the "attendly_" prefix to avoid collisions
   with other applications on the same origin.
   ============================================================ */

// ── Storage key registry ──
const STORAGE_KEYS = Object.freeze({
  users:                'attendly_users',
  attendance:           'attendly_attendance',
  events:               'attendly_events',
  sanctions:            'attendly_sanctions',
  announcements:        'attendly_announcements',
  appeals:              'attendly_appeals',
  biometrics:           'attendly_biometrics',
  biometricAudit:       'attendly_biometric_audit',
  reenrollmentRequests: 'attendly_reenrollment_requests',
  session:              'attendly_session',
  sanctionPolicy:       'attendly_sanction_policy',
  flaggedStudents:      'attendly_flagged_students',
});

// ── Default sanction policy thresholds ──
// These define the number of unexcused absences that trigger
// each severity level, broken down by event type.
const DEFAULT_SANCTION_POLICY = Object.freeze({
  minor: { warning: 3, probation: 5, suspension: 7 },
  major: { warning: 1, probation: 2, suspension: 3 },
});


/* ============================================================
   Seed Data — populates localStorage on first visit
   ============================================================ */

/**
 * Initialize mock data if not already present.
 * Safe to call on every page load — each block is guarded by
 * an existence check so existing data is never overwritten.
 */
function initMockData() {
  const today = todayStr();
  const tomorrow = todayStr(1);

  // ── Users ──
  if (!localStorage.getItem(STORAGE_KEYS.users)) {
    const users = [
      { id: 'u1', name: 'John Student',   email: 'student@example.com', password: 'password123', role: 'student' },
      { id: 'u2', name: 'SSC Officer',     email: 'officer@example.com', password: 'password123', role: 'ssc-officer' },
      { id: 'u3', name: 'Alice Student',   email: 'alice@example.com',   password: 'password123', role: 'student' },
      { id: 'u4', name: 'Bob Student',     email: 'bob@example.com',     password: 'password123', role: 'student' },
    ];
    localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
  }

  // ── Events ──
  if (!localStorage.getItem(STORAGE_KEYS.events)) {
    const events = [
      { id: 'e1', name: 'Tech Workshop',      date: today,     time: '10:00', location: 'Room A',       type: 'minor', mandatory: false, recurring: null },
      { id: 'e2', name: 'Seminar on AI',       date: tomorrow,  time: '14:00', location: 'Auditorium',   type: 'major', mandatory: true,  recurring: null },
      { id: 'e3', name: 'Weekly Flag Ceremony', date: today,     time: '07:00', location: 'Quadrangle',   type: 'minor', mandatory: true,  recurring: { pattern: 'weekly', day: 'Monday' } },
    ];
    localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(events));
  }

  // ── Attendance ──
  if (!localStorage.getItem(STORAGE_KEYS.attendance)) {
    const attendance = [
      { id: 'a1', studentId: 'u1', eventId: 'e1', date: today,     time: '10:05', status: 'present', excused: false, excuseReason: '' },
      { id: 'a2', studentId: 'u4', eventId: 'e1', date: today,     time: '10:12', status: 'late',    excused: false, excuseReason: '' },
      { id: 'a3', studentId: 'u3', eventId: 'e1', date: today,     time: null,    status: 'absent',  excused: true,  excuseReason: 'Documented medical appointment' },
      { id: 'a4', studentId: 'u3', eventId: 'e3', date: today,     time: null,    status: 'absent',  excused: false, excuseReason: '' },
      { id: 'a5', studentId: 'u3', eventId: 'e2', date: tomorrow,  time: null,    status: 'absent',  excused: false, excuseReason: '' },
    ];
    localStorage.setItem(STORAGE_KEYS.attendance, JSON.stringify(attendance));
  }

  // ── Sanctions ──
  if (!localStorage.getItem(STORAGE_KEYS.sanctions)) {
    const yesterday = todayStr(-1);
    const lastWeek  = todayStr(-7);
    const sanctions = [
      {
        id: 's1', studentId: 'u1', description: 'Repeated tardiness',
        severity: 'warning', status: 'active', date: today, officerId: 'u2', eventId: 'e1',
        notes: 'Student arrived 15 minutes late for the third consecutive time. Verified via kiosk timestamp.',
      },
      {
        id: 's2', studentId: 'u4', description: 'Unexcused absence',
        severity: 'probation', status: 'active', date: yesterday, officerId: 'u2', eventId: 'e2',
        notes: 'Student did not attend the Seminar on AI without prior notification. No appeal on file.',
      },
      {
        id: 's3', studentId: 'u1', description: 'Missing biometric enrollment',
        severity: 'warning', status: 'resolved', date: lastWeek, officerId: 'u2', eventId: null,
        notes: 'Student was reminded to complete biometric enrollment. Resolved after compliance.',
      },
    ];
    localStorage.setItem(STORAGE_KEYS.sanctions, JSON.stringify(sanctions));
  }

  // ── Appeals ──
  if (!localStorage.getItem(STORAGE_KEYS.appeals)) {
    const appeals = [
      {
        id: 'ap1', studentId: 'u1', sanctionId: 's3',
        reason: 'I was sick during the enrollment period and could not attend.',
        status: 'approved', date: todayStr(-5), reviewedBy: 'u2',
        reviewNotes: 'Medical certificate verified. Appeal approved.',
      },
    ];
    localStorage.setItem(STORAGE_KEYS.appeals, JSON.stringify(appeals));
  }

  // ── Sanction policy (configurable thresholds) ──
  if (!localStorage.getItem(STORAGE_KEYS.sanctionPolicy)) {
    localStorage.setItem(STORAGE_KEYS.sanctionPolicy, JSON.stringify(DEFAULT_SANCTION_POLICY));
  }

  // ── Flagged students (auto-generated, officer reviews) ──
  if (!localStorage.getItem(STORAGE_KEYS.flaggedStudents)) {
    localStorage.setItem(STORAGE_KEYS.flaggedStudents, JSON.stringify([]));
  }

  // ── Biometrics ──
  // Seed data so the kiosk's fingerprint simulation has enrolled
  // students to match against. In production these templates are
  // stored server-side and never sent to the browser (see backend/).
  if (!localStorage.getItem(STORAGE_KEYS.biometrics)) {
    const biometrics = [
      { studentId: 'u1', templateId: 'tmpl_enroll_u1',          registeredAt: todayStr(-6),  status: 'enrolled',            quality: 'good',  consentCaptured: true, identityVerified: true },
      { studentId: 'u3', templateId: 'tmpl_enroll_u3',          registeredAt: todayStr(-20), status: 'enrolled',            quality: 'good',  consentCaptured: true, identityVerified: true },
      { studentId: 'u4', templateId: 'tmpl_needs_reenroll_u4',  registeredAt: todayStr(-40), status: 'needs-reenrollment',  quality: 'poor',  consentCaptured: true, identityVerified: false },
    ];
    localStorage.setItem(STORAGE_KEYS.biometrics, JSON.stringify(biometrics));
  }

  // ── Announcements ──
  if (!localStorage.getItem(STORAGE_KEYS.announcements)) {
    const announcements = [
      { id: 'n1', title: 'Seminar on AI is tomorrow',    detail: 'Auditorium · 2:00 PM',        type: 'event' },
      { id: 'n2', title: 'Attendance policy reminder',   detail: 'Please arrive before the event starts.', type: 'notice' },
      { id: 'n3', title: 'Tech Workshop check-in',       detail: 'Room A · Scan at the event kiosk.',     type: 'event' },
    ];
    localStorage.setItem(STORAGE_KEYS.announcements, JSON.stringify(announcements));
  }
}

// Seed data on every page load (no-ops if already seeded).
initMockData();


/* ============================================================
   Date Helpers
   ============================================================ */

/**
 * Return today's date as a local "YYYY-MM-DD" string, optionally
 * offset by `offsetDays`. Uses local time (not UTC) so the
 * date changeover happens at local midnight.
 *
 * @param {number} [offsetDays=0] — days to add (negative = past)
 * @returns {string} e.g. "2026-09-08"
 */
function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}


/* ============================================================
   Generic localStorage Getters & Setters
   ============================================================ */

/**
 * Safely parse a JSON value from localStorage.
 * Returns `fallback` when the key is missing or the value
 * is corrupt (avoids runtime crashes on corrupted storage).
 *
 * @param {string} key      — localStorage key
 * @param {*}      fallback — value returned on missing/corrupt data
 * @returns {*}
 */
function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getUsers()                { return safeGet(STORAGE_KEYS.users, []); }
function getEvents()               { return safeGet(STORAGE_KEYS.events, []); }
function getAttendance()           { return safeGet(STORAGE_KEYS.attendance, []); }
function getSanctions()            { return safeGet(STORAGE_KEYS.sanctions, []); }
function getAnnouncements()        { return safeGet(STORAGE_KEYS.announcements, []); }
function getAppeals()              { return safeGet(STORAGE_KEYS.appeals, []); }
function getBiometrics()           { return safeGet(STORAGE_KEYS.biometrics, []); }
function getBiometricAudit()       { return safeGet(STORAGE_KEYS.biometricAudit, []); }
function getReenrollmentRequests() { return safeGet(STORAGE_KEYS.reenrollmentRequests, []); }
function getSanctionPolicy()       { return safeGet(STORAGE_KEYS.sanctionPolicy, DEFAULT_SANCTION_POLICY); }
function getFlaggedStudents()      { return safeGet(STORAGE_KEYS.flaggedStudents, []); }

function setUsers(users)                 { localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users)); }
function setEvents(events)               { localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(events)); }
function setAttendance(attendance)       { localStorage.setItem(STORAGE_KEYS.attendance, JSON.stringify(attendance)); }
function setSanctions(sanctions)         { localStorage.setItem(STORAGE_KEYS.sanctions, JSON.stringify(sanctions)); }
function setAnnouncements(announcements) { localStorage.setItem(STORAGE_KEYS.announcements, JSON.stringify(announcements)); }
function setAppeals(appeals)             { localStorage.setItem(STORAGE_KEYS.appeals, JSON.stringify(appeals)); }
function setBiometrics(biometrics)       { localStorage.setItem(STORAGE_KEYS.biometrics, JSON.stringify(biometrics)); }
function setBiometricAudit(logs)         { localStorage.setItem(STORAGE_KEYS.biometricAudit, JSON.stringify(logs)); }
function setReenrollmentRequests(reqs)   { localStorage.setItem(STORAGE_KEYS.reenrollmentRequests, JSON.stringify(reqs)); }
function setSanctionPolicy(policy)       { localStorage.setItem(STORAGE_KEYS.sanctionPolicy, JSON.stringify(policy)); }
function setFlaggedStudents(flags)       { localStorage.setItem(STORAGE_KEYS.flaggedStudents, JSON.stringify(flags)); }


/* ============================================================
   Sanction Policy & Auto-Flagging
   ============================================================ */

/**
 * Compute unexcused absences for a student, broken down by
 * event type (minor / major). Used by the auto-flag system
 * and the SSC dashboard.
 *
 * @param {string} studentId
 * @returns {{ minor: number, major: number }}
 */
function computeUnexcusedAbsences(studentId) {
  const attendance = getAttendance().filter(
    a => a.studentId === studentId && a.status === 'absent' && !a.excused
  );
  const events = getEvents();
  const counts = { minor: 0, major: 0 };

  attendance.forEach(a => {
    const event = events.find(e => e.id === a.eventId);
    if (event && counts[event.type] !== undefined) {
      counts[event.type]++;
    }
  });

  return counts;
}

/**
 * Given an event type and the student's unexcused-absence count,
 * return the severity level that crosses the policy threshold,
 * or null if still below all thresholds.
 *
 * @param {'minor'|'major'} eventType
 * @param {number} unexcusedCount
 * @returns {'warning'|'probation'|'suspension'|null}
 */
function getSuggestedSeverity(eventType, unexcusedCount) {
  const policy     = getSanctionPolicy();
  const thresholds = policy[eventType] || policy.minor;

  if (unexcusedCount >= thresholds.suspension) return 'suspension';
  if (unexcusedCount >= thresholds.probation)  return 'probation';
  if (unexcusedCount >= thresholds.warning)    return 'warning';
  return null; // below threshold
}

/**
 * Scan all students for new threshold crossings and create
 * flagged-student entries for the SSC officer to review.
 * Deduplicates against existing flags and active sanctions.
 *
 * @returns {Array} combined list of existing + new flags
 */
function autoFlagStudents() {
  const students      = getUsers().filter(u => u.role === 'student');
  const existingFlags = getFlaggedStudents();
  const existingKeys  = new Set(existingFlags.map(f => `${f.studentId}:${f.eventType}`));
  const newFlags      = [];

  students.forEach(student => {
    const counts = computeUnexcusedAbsences(student.id);

    ['minor', 'major'].forEach(type => {
      const count = counts[type];
      if (count <= 0) return;

      const suggested = getSuggestedSeverity(type, count);
      if (!suggested) return;

      const key = `${student.id}:${type}`;
      if (existingKeys.has(key)) return; // already flagged

      // Skip if a matching active sanction already exists
      const alreadySanctioned = getSanctions().some(
        s => s.studentId === student.id && s.severity === suggested && s.status === 'active'
      );
      if (alreadySanctioned) return;

      newFlags.push({
        id: generateId('flag'),
        studentId: student.id,
        eventType: type,
        unexcusedCount: count,
        suggestedSeverity: suggested,
        date: todayStr(),
      });
    });
  });

  if (newFlags.length > 0) {
    setFlaggedStudents([...existingFlags, ...newFlags]);
  }
  return [...existingFlags, ...newFlags];
}


/* ============================================================
   Session Management
   ============================================================ */

/**
 * Retrieve the current session object from localStorage.
 * @returns {{ id: string, name: string, email: string, role: string }|null}
 */
function getSession() {
  return safeGet(STORAGE_KEYS.session, null);
}

/**
 * Persist a minimal, non-sensitive session record.
 * Only id, name, email, and role are stored — the password
 * stays in the users collection and is never serialised to
 * the session key.
 *
 * @param {object|null} user — pass null to clear the session
 */
function setSession(user) {
  if (!user) { clearSession(); return; }
  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({
    id:    user.id,
    name:  user.name,
    email: user.email,
    role:  user.role,
  }));
}

/** Remove the active session. */
function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.session);
}

/**
 * Resolve the currently-logged-in user by cross-referencing the
 * session record against the users collection. Returns null when
 * the session is missing or the user was deleted.
 *
 * @returns {object|null} full user object (including role)
 */
function getCurrentUser() {
  const session = getSession();
  if (!session) return null;
  const users = getUsers();
  return users.find(u => u.id === session.id) || null;
}


/* ============================================================
   Utility
   ============================================================ */

/**
 * Generate a collision-resistant unique ID. The prefix makes
 * it easy to identify the entity type in the DOM / console.
 *
 * @param {string} [prefix='id'] — e.g. 'stu', 'evt', 'sanc'
 * @returns {string} e.g. "stu_k3j9f8a2m"
 */
function generateId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).substring(2, 11)}`;
}
