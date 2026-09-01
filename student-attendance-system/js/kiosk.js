document.addEventListener('DOMContentLoaded', function() {
  const user = requireAuth('ssc-officer');
  if (!user) return;

  loadKioskEvents();
  const eventSelect = document.getElementById('kioskEvent');
  const scanForm = document.getElementById('kioskScanForm');
  const input = document.getElementById('studentIdInput');

  eventSelect.addEventListener('change', updateKioskCount);
  scanForm.addEventListener('submit', function(event) {
    event.preventDefault();
    recordKioskAttendance(input.value);
  });
  updateKioskCount();
  input.focus();
});

function loadKioskEvents() {
  const select = document.getElementById('kioskEvent');
  const events = getEvents();
  select.innerHTML = events.length
    ? events.map(event => `<option value="${event.id}">${event.name} - ${formatDate(event.date)} at ${event.time}</option>`).join('')
    : '<option value="">No events available</option>';
}

function updateKioskCount() {
  const eventId = document.getElementById('kioskEvent').value;
  const count = getAttendance().filter(record => record.eventId === eventId).length;
  document.getElementById('kioskCount').textContent = count;
}

function recordKioskAttendance(rawStudentId) {
  const studentId = rawStudentId.trim();
  const eventId = document.getElementById('kioskEvent').value;
  const input = document.getElementById('studentIdInput');
  const student = getUsers().find(user => user.role === 'student' && (user.id === studentId || user.email === studentId));
  const event = getEvents().find(item => item.id === eventId);

  if (!event) {
    showKioskResult('No event selected', 'Create or select an event before scanning.', 'danger');
  } else if (!student) {
    showKioskResult('Student not found', `No student matches “${studentId || 'the scanned value'}”.`, 'danger');
    showToast('error', 'Student ID was not recognized.');
  } else {
    const attendance = getAttendance();
    const alreadyRecorded = attendance.some(record => record.studentId === student.id && record.eventId === event.id);
    if (alreadyRecorded) {
      showKioskResult('Already recorded', `${student.name} is already present for ${event.name}.`, 'warning');
      showToast('warning', 'This student is already marked present.');
    } else {
      attendance.push({
        id: generateId('att'),
        studentId: student.id,
        eventId: event.id,
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toTimeString().slice(0, 5),
        status: 'present'
      });
      setAttendance(attendance);
      showKioskResult('Attendance recorded', `${student.name} is present for ${event.name}.`, 'success');
      showToast('success', `${student.name} marked present.`);
      updateKioskCount();
    }
  }

  input.value = '';
  input.focus();
}

function showKioskResult(title, message, type) {
  const icon = type === 'success' ? 'check-circle-fill' : type === 'warning' ? 'exclamation-triangle-fill' : 'x-circle-fill';
  const color = type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'danger';
  document.getElementById('scanResult').innerHTML = `
    <div class="card-body d-flex flex-column justify-content-center align-items-center text-center p-4">
      <i class="bi bi-${icon} kiosk-icon text-${color}"></i>
      <h2 class="h4 mt-3">${title}</h2>
      <p class="text-muted mb-0">${message}</p>
    </div>`;
}
