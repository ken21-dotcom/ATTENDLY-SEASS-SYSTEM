// Organizer page-specific logic

let monitorInterval = null;

document.addEventListener('DOMContentLoaded', function() {
  // Only run organizer logic if the organizer page elements exist
  if (!document.getElementById('eventSelect')) return;

  const user = requireAuth('organizer');
  if (!user) return;

  // Create event form
  const createEventForm = document.getElementById('createEventForm');
  if (createEventForm) {
    createEventForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const name = document.getElementById('eventName').value.trim();
      const date = document.getElementById('eventDate').value;
      const time = document.getElementById('eventTime').value;
      const location = document.getElementById('eventLocation').value.trim();
      if (!name || !date || !time || !location) {
        showToast('error', 'Please fill all fields.');
        return;
      }
      const events = getEvents();
      const newEvent = {
        id: generateId('evt'),
        name,
        date,
        time,
        location
      };
      events.push(newEvent);
      setEvents(events);
      const announcements = getAnnouncements();
      announcements.unshift({
        id: generateId('notice'),
        title: `${name} has been announced`,
        detail: `${location} · ${date} at ${time}`,
        type: 'event'
      });
      setAnnouncements(announcements.slice(0, 10));
      showToast('success', 'Event created successfully.');
      createEventForm.reset();
    });
  }

  // Event monitor
  if (document.getElementById('eventSelect')) {
    loadEventOptions();
    loadMonitorData();
    // Set interval for real-time updates
    monitorInterval = setInterval(() => {
      if (document.getElementById('eventSelect')) {
        addRandomAttendance();
      }
    }, 4000);
  }

  // Cleanup interval on page unload
  window.addEventListener('beforeunload', function() {
    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }
  });
});

function loadEventOptions() {
  const select = document.getElementById('eventSelect');
  if (!select) return;
  const events = getEvents();
  select.innerHTML = events.map(e => `<option value="${e.id}">${e.name} - ${e.date} ${e.time}</option>`).join('');
}

function getSelectedEventId() {
  const select = document.getElementById('eventSelect');
  if (!select) return null;
  return select.value || (getEvents()[0] ? getEvents()[0].id : null);
}

function loadMonitorData() {
  const eventId = getSelectedEventId();
  if (!eventId) return;
  const attendance = getAttendance().filter(a => a.eventId === eventId);
  const count = document.getElementById('attendanceCount');
  const feed = document.getElementById('attendanceFeed');
  if (count) count.textContent = attendance.length;
  if (feed) {
    feed.innerHTML = '';
    attendance.forEach(record => {
      const student = getUsers().find(u => u.id === record.studentId);
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      li.innerHTML = `
        <span><i class="bi bi-person-circle me-2"></i>${student ? student.name : 'Unknown Student'}</span>
        <small class="text-muted">${record.time} (${record.status})</small>
      `;
      feed.appendChild(li);
    });
    toggleEmptyState('monitorEmpty', attendance.length > 0);
  }
}

function addRandomAttendance() {
  const eventId = getSelectedEventId();
  if (!eventId) return;
  const students = getUsers().filter(u => u.role === 'student');
  if (students.length === 0) return;
  const randomStudent = students[Math.floor(Math.random() * students.length)];
  const attendance = getAttendance();
  // Check if already attended (simple: allow multiple? we'll just add if not present for simplicity)
  const already = attendance.some(a => a.studentId === randomStudent.id && a.eventId === eventId);
  if (already) return; // skip if already attended
  const newRecord = {
    id: generateId('att'),
    studentId: randomStudent.id,
    eventId: eventId,
    date: new Date().toISOString().slice(0,10),
    time: new Date().toTimeString().slice(0,5),
    status: Math.random() > 0.2 ? 'present' : 'late'
  };
  attendance.push(newRecord);
  setAttendance(attendance);
  // Update UI without full reload (just append to feed and update count)
  const feed = document.getElementById('attendanceFeed');
  const count = document.getElementById('attendanceCount');
  if (feed) {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `
      <span><i class="bi bi-person-circle me-2"></i>${randomStudent.name}</span>
      <small class="text-muted">${newRecord.time} (${newRecord.status})</small>
    `;
    feed.appendChild(li);
    toggleEmptyState('monitorEmpty', true);
  }
  if (count) count.textContent = attendance.filter(a => a.eventId === eventId).length;
}