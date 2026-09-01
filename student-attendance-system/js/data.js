// Mock data and localStorage helpers

const STORAGE_KEYS = {
  users: 'sass_users',
  attendance: 'sass_attendance',
  events: 'sass_events',
  sanctions: 'sass_sanctions',
  announcements: 'sass_announcements',
  appeals: 'sass_appeals',
  biometrics: 'sass_biometrics',
  biometricAudit: 'sass_biometric_audit',
  reenrollmentRequests: 'sass_reenrollment_requests',
  session: 'sass_session',
  sanctionPolicy: 'sass_sanction_policy',
  flaggedStudents: 'sass_flagged_students'
};

// Default sanction policy thresholds
const DEFAULT_SANCTION_POLICY = {
  minor: { warning: 3, probation: 5, suspension: 7 },
  major: { warning: 1, probation: 2, suspension: 3 }
};

// Initialize dummy data if not present
function initMockData() {
  // Users
  if (!localStorage.getItem(STORAGE_KEYS.users)) {
    const users = [
      { id: 'u1', name: 'John Student', email: 'student@example.com', password: 'password123', role: 'student' },
      { id: 'u2', name: 'SSC Officer', email: 'officer@example.com', password: 'password123', role: 'ssc-officer' },
      { id: 'u3', name: 'Alice Student', email: 'alice@example.com', password: 'password123', role: 'student' },
      { id: 'u4', name: 'Bob Student', email: 'bob@example.com', password: 'password123', role: 'student' }
    ];
    localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
  }

  // Events — now with type, mandatory, recurring fields
  if (!localStorage.getItem(STORAGE_KEYS.events)) {
    const today = new Date().toISOString().slice(0,10);
    const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);
    const events = [
      { id: 'e1', name: 'Tech Workshop', date: today, time: '10:00', location: 'Room A', type: 'minor', mandatory: false, recurring: null },
      { id: 'e2', name: 'Seminar on AI', date: tomorrow, time: '14:00', location: 'Auditorium', type: 'major', mandatory: true, recurring: null },
      { id: 'e3', name: 'Weekly Flag Ceremony', date: today, time: '07:00', location: 'Quadrangle', type: 'minor', mandatory: true, recurring: { pattern: 'weekly', day: 'Monday' } }
    ];
    localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(events));
  }

  // Attendance — now with excused flag
  if (!localStorage.getItem(STORAGE_KEYS.attendance)) {
    const attendance = [
      { id: 'a1', studentId: 'u1', eventId: 'e1', date: new Date().toISOString().slice(0,10), time: '10:05', status: 'present', excused: false, excuseReason: '' },
      { id: 'a2', studentId: 'u4', eventId: 'e1', date: new Date().toISOString().slice(0,10), time: '10:12', status: 'late', excused: false, excuseReason: '' },
      { id: 'a3', studentId: 'u3', eventId: 'e1', date: new Date().toISOString().slice(0,10), time: null, status: 'absent', excused: true, excuseReason: 'Documented medical appointment' },
      { id: 'a4', studentId: 'u3', eventId: 'e3', date: new Date().toISOString().slice(0,10), time: null, status: 'absent', excused: false, excuseReason: '' },
      { id: 'a5', studentId: 'u3', eventId: 'e2', date: tomorrow, time: null, status: 'absent', excused: false, excuseReason: '' }
    ];
    localStorage.setItem(STORAGE_KEYS.attendance, JSON.stringify(attendance));
  }

  // Sanctions
  if (!localStorage.getItem(STORAGE_KEYS.sanctions)) {
    const today = new Date().toISOString().slice(0,10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0,10);
    const sanctions = [
      { id: 's1', studentId: 'u1', description: 'Repeated tardiness', severity: 'warning', status: 'active', date: today, officerId: 'u2', eventId: 'e1', notes: 'Student arrived 15 minutes late for the third consecutive time. Verified via kiosk timestamp.' },
      { id: 's2', studentId: 'u4', description: 'Unexcused absence', severity: 'probation', status: 'active', date: yesterday, officerId: 'u2', eventId: 'e2', notes: 'Student did not attend the Seminar on AI without prior notification. No appeal on file.' },
      { id: 's3', studentId: 'u1', description: 'Missing biometric enrollment', severity: 'warning', status: 'resolved', date: lastWeek, officerId: 'u2', eventId: null, notes: 'Student was reminded to complete biometric enrollment. Resolved after compliance.' }
    ];
    localStorage.setItem(STORAGE_KEYS.sanctions, JSON.stringify(sanctions));
  }

  // Appeals
  if (!localStorage.getItem(STORAGE_KEYS.appeals)) {
    const appeals = [
      { id: 'ap1', studentId: 'u1', sanctionId: 's3', reason: 'I was sick during the enrollment period and could not attend.', status: 'approved', date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0,10), reviewedBy: 'u2', reviewNotes: 'Medical certificate verified. Appeal approved.' }
    ];
    localStorage.setItem(STORAGE_KEYS.appeals, JSON.stringify(appeals));
  }

  // Sanction policy (configurable thresholds)
  if (!localStorage.getItem(STORAGE_KEYS.sanctionPolicy)) {
    localStorage.setItem(STORAGE_KEYS.sanctionPolicy, JSON.stringify(DEFAULT_SANCTION_POLICY));
  }

  // Flagged students (auto-generated, officer reviews)
  if (!localStorage.getItem(STORAGE_KEYS.flaggedStudents)) {
    localStorage.setItem(STORAGE_KEYS.flaggedStudents, JSON.stringify([]));
  }

  if (!localStorage.getItem(STORAGE_KEYS.announcements)) {
    const announcements = [
      { id: 'n1', title: 'Seminar on AI is tomorrow', detail: 'Auditorium · 2:00 PM', type: 'event' },
      { id: 'n2', title: 'Attendance policy reminder', detail: 'Please arrive before the event starts.', type: 'notice' },
      { id: 'n3', title: 'Tech Workshop check-in', detail: 'Room A · Scan at the event kiosk.', type: 'event' }
    ];
    localStorage.setItem(STORAGE_KEYS.announcements, JSON.stringify(announcements));
  }
}

// Call on page load
initMockData();

// ── Helper functions to get/set data ──

function getUsers() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || '[]');
}

function getEvents() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.events) || '[]');
}

function getAttendance() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.attendance) || '[]');
}

function getSanctions() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.sanctions) || '[]');
}

function getAnnouncements() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.announcements) || '[]');
}

function getAppeals() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.appeals) || '[]');
}

function getBiometrics() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.biometrics) || '[]');
}

function setBiometrics(biometrics) {
  localStorage.setItem(STORAGE_KEYS.biometrics, JSON.stringify(biometrics));
}

function getBiometricAudit() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.biometricAudit) || '[]');
}

function setBiometricAudit(logs) {
  localStorage.setItem(STORAGE_KEYS.biometricAudit, JSON.stringify(logs));
}

function getReenrollmentRequests() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.reenrollmentRequests) || '[]');
}

function setReenrollmentRequests(requests) {
  localStorage.setItem(STORAGE_KEYS.reenrollmentRequests, JSON.stringify(requests));
}

function setAppeals(appeals) {
  localStorage.setItem(STORAGE_KEYS.appeals, JSON.stringify(appeals));
}

function setAnnouncements(announcements) {
  localStorage.setItem(STORAGE_KEYS.announcements, JSON.stringify(announcements));
}

function setUsers(users) {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
}

function setEvents(events) {
  localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(events));
}

function setAttendance(attendance) {
  localStorage.setItem(STORAGE_KEYS.attendance, JSON.stringify(attendance));
}

function setSanctions(sanctions) {
  localStorage.setItem(STORAGE_KEYS.sanctions, JSON.stringify(sanctions));
}

// ── Sanction Policy ──

function getSanctionPolicy() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.sanctionPolicy) || JSON.stringify(DEFAULT_SANCTION_POLICY));
}

function setSanctionPolicy(policy) {
  localStorage.setItem(STORAGE_KEYS.sanctionPolicy, JSON.stringify(policy));
}

// ── Flagged Students ──

function getFlaggedStudents() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.flaggedStudents) || '[]');
}

function setFlaggedStudents(flags) {
  localStorage.setItem(STORAGE_KEYS.flaggedStudents, JSON.stringify(flags));
}

// ── Compute unexcused absences per student per event type ──

function computeUnexcusedAbsences(studentId) {
  const attendance = getAttendance().filter(a => a.studentId === studentId && a.status === 'absent' && !a.excused);
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

// ── Determine suggested severity from policy ──

function getSuggestedSeverity(eventType, unexcusedCount) {
  const policy = getSanctionPolicy();
  const thresholds = policy[eventType] || policy.minor;
  if (unexcusedCount >= thresholds.suspension) return 'suspension';
  if (unexcusedCount >= thresholds.probation) return 'probation';
  if (unexcusedCount >= thresholds.warning) return 'warning';
  return null; // below threshold
}

// ── Auto-flag students who crossed thresholds ──

function autoFlagStudents() {
  const students = getUsers().filter(u => u.role === 'student');
  const existingFlags = getFlaggedStudents();
  const existingKeys = new Set(existingFlags.map(f => f.studentId + ':' + f.eventType));
  const newFlags = [];

  students.forEach(student => {
    const counts = computeUnexcusedAbsences(student.id);
    ['minor', 'major'].forEach(type => {
      const count = counts[type];
      if (count <= 0) return;
      const suggested = getSuggestedSeverity(type, count);
      if (!suggested) return;
      const key = student.id + ':' + type;
      if (existingKeys.has(key)) return; // already flagged
      // Check if a sanction already exists for this student+severity
      const existingSanctions = getSanctions().filter(s => s.studentId === student.id && s.severity === suggested && s.status === 'active');
      if (existingSanctions.length > 0) return; // already sanctioned
      newFlags.push({
        id: generateId('flag'),
        studentId: student.id,
        eventType: type,
        unexcusedCount: count,
        suggestedSeverity: suggested,
        date: new Date().toISOString().slice(0, 10)
      });
    });
  });

  if (newFlags.length > 0) {
    setFlaggedStudents([...existingFlags, ...newFlags]);
  }
  return [...existingFlags, ...newFlags];
}

// ── Session management ──

function getSession() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.session) || 'null');
}

function setSession(user) {
  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.session);
}

// Utility: generate a unique id
function generateId(prefix = 'id') {
  return prefix + '_' + Math.random().toString(36).substring(2, 11);
}

// Get current user
function getCurrentUser() {
  const session = getSession();
  if (!session) return null;
  const users = getUsers();
  return users.find(u => u.id === session.id) || null;
}
