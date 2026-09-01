// Student page-specific logic

let dashboardCalendarDate = new Date();

document.addEventListener('DOMContentLoaded', function() {
  const user = requireAuth('student');
  if (!user) return;

  const studentName = document.getElementById('studentName');
  const todayLabel = document.getElementById('todayLabel');
  if (studentName) studentName.textContent = user.name;
  if (todayLabel) todayLabel.textContent = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  if (document.getElementById('miniCalendar')) {
    loadStudentDashboard(user);
    document.querySelector('[aria-label="Previous month"]').addEventListener('click', function() {
      dashboardCalendarDate = new Date(dashboardCalendarDate.getFullYear(), dashboardCalendarDate.getMonth() - 1, 1);
      renderMiniCalendar(dashboardCalendarDate, getEvents());
    });
    document.querySelector('[aria-label="Next month"]').addEventListener('click', function() {
      dashboardCalendarDate = new Date(dashboardCalendarDate.getFullYear(), dashboardCalendarDate.getMonth() + 1, 1);
      renderMiniCalendar(dashboardCalendarDate, getEvents());
    });
  }

  // On attendance page: load attendance records
  if (document.getElementById('attendanceTableBody')) {
    loadStudentAttendance(user.id);
  }

  // On sanctions page: load sanctions (skip if enhanced version handles it)
  if (document.getElementById('sanctionTableBody') && !document.getElementById('sanctionStats')) {
    loadStudentSanctions(user.id);
  }

  if (document.getElementById('appealForm')) {
    loadAppealForm(user.id);
  }

  // Profile page (profileBiometricStatus) or kiosk page (enrollmentStatus)
  if (document.getElementById('profileBiometricStatus') || document.getElementById('enrollmentStatus')) {
    loadEnrollmentStatus(user.id);
  }

  if (document.getElementById('profileForm')) {
    loadStudentProfile(user);
  }
});

function loadStudentDashboard(user) {
  const firstName = user.name.split(' ')[0];
  document.getElementById('studentName').textContent = user.name;
  document.getElementById('welcomeName').textContent = firstName;
  document.getElementById('todayLabel').textContent = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const events = getEvents();
  const attendance = getAttendance().filter(record => record.studentId === user.id);
  const sanctions = getSanctions().filter(record => record.studentId === user.id && record.status === 'active');
  const presentCount = attendance.filter(record => record.status === 'present' || record.status === 'late').length;
  const totalEvents = Math.max(events.length, presentCount);
  const attendanceRate = totalEvents ? Math.round((presentCount / totalEvents) * 100) : 0;
  const absentRate = Math.max(0, 100 - attendanceRate);

  document.getElementById('attendanceRate').textContent = `${attendanceRate}%`;
  document.getElementById('attendanceProgress').style.width = `${attendanceRate}%`;
  document.getElementById('presentCount').textContent = presentCount;
  document.getElementById('sanctionCount').textContent = sanctions.length;

  // FR14/FR17: derive current standing from the most severe active sanction
  const severityRank = { suspension: 3, probation: 2, warning: 1 };
  const standingLabels = { suspension: 'Suspension', probation: 'Probation', warning: 'Warning', good: 'Good Standing' };
  let standing = 'good';
  sanctions.forEach(record => {
    if ((severityRank[record.severity] || 0) > (severityRank[standing] || 0)) standing = record.severity;
  });
  const standingElement = document.getElementById('standingStatus');
  if (standingElement) {
    standingElement.textContent = standingLabels[standing] || 'Good Standing';
    standingElement.className = `enrollment-pill standing-${standing}`;
  }

  document.getElementById('donutPercent').textContent = `${attendanceRate}%`;
  document.getElementById('presentLegend').textContent = `${attendanceRate}%`;
  document.getElementById('absentLegend').textContent = `${absentRate}%`;
  document.getElementById('attendanceDonut').style.setProperty('--present-rate', `${attendanceRate}%`);

  renderAnnouncements();
  renderMiniCalendar(dashboardCalendarDate, events);
}

function loadEnrollmentStatus(studentId) {
  const record = getBiometrics().find(item => item.studentId === studentId);
  // Profile page uses profileBiometricStatus; kiosk page uses enrollmentStatus
  const statusElement = document.getElementById('profileBiometricStatus') || document.getElementById('enrollmentStatus');
  const detailElement = document.getElementById('profileBiometricDetail') || document.getElementById('enrollmentStatusDetail');
  const actionContainer = document.getElementById('reenrollmentAction');
  const requestButton = document.getElementById('reenrollmentRequestButton');
  const requests = getReenrollmentRequests().filter(request => request.studentId === studentId && request.status === 'pending');
  const status = record ? record.status : 'not-enrolled';
  const labels = { enrolled: 'Enrolled', 'needs-reenrollment': 'Needs re-enrollment', 'not-enrolled': 'Not enrolled' };
  statusElement.textContent = labels[status] || 'Not enrolled';
  statusElement.className = `enrollment-pill ${status}`;
  detailElement.textContent = record ? `Last updated ${formatDate(record.registeredAt)} · Template quality: ${record.quality || 'standard'}` : 'Your fingerprint can only be registered or changed by an ATTENDLY administrator.';

  const setButtonState = function(disabled, text) {
    if (requestButton) {
      requestButton.disabled = disabled;
      requestButton.textContent = text;
      requestButton.classList.remove('btn-danger', 'btn-outline-danger');
      requestButton.classList.add(disabled ? 'btn-outline-secondary' : 'btn-outline-danger');
    }
  };

  // Profile page: show re-enrollment action when not fully enrolled
  if (status !== 'enrolled' && actionContainer) {
    actionContainer.classList.remove('d-none');
    setButtonState(requests.length > 0, requests.length > 0 ? 'Request pending' : 'Request re-enrollment');
  }

  // Remove any existing event listeners by cloning the button
  const newButton = requestButton.cloneNode(true);
  requestButton.parentNode.replaceChild(newButton, requestButton);

  newButton.addEventListener('click', function() {
    const modalEl = document.getElementById('reenrollmentModal');
    if (modalEl) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  });

  // Handle form submission
  const submitBtn = document.getElementById('submitReenrollmentRequest');
  if (submitBtn) {
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
    newSubmitBtn.addEventListener('click', function() {
      const reason = document.getElementById('reenrollmentReason').value.trim();
      const acknowledge = document.getElementById('reenrollmentAcknowledge').checked;
      if (!reason || !acknowledge) {
        showToast('error', 'Please provide a reason and acknowledge the statement.');
        return;
      }
      const updatedRequests = getReenrollmentRequests();
      updatedRequests.push({ id: generateId('reenroll'), studentId, reason, status: 'pending', date: new Date().toISOString().slice(0, 10) });
      setReenrollmentRequests(updatedRequests);
      if (requestButton) {
        requestButton.disabled = true;
        requestButton.textContent = 'Request pending';
        requestButton.classList.remove('btn-danger', 'btn-outline-danger');
        requestButton.classList.add('btn-outline-secondary');
      }
      document.getElementById('reenrollmentForm').reset();
      bootstrap.Modal.getInstance(document.getElementById('reenrollmentModal')).hide();
      showToast('success', 'Re-enrollment request sent to the admin.');
    });
  }
}

function loadStudentProfile(user) {
  const nameInput = document.getElementById('profileName');
  const emailInput = document.getElementById('profileEmail');
  const idInput = document.getElementById('profileId');
  nameInput.value = user.name;
  emailInput.value = user.email;
  idInput.value = user.id;
  document.getElementById('profileForm').addEventListener('submit', function(event) {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const users = getUsers().map(item => item.id === user.id ? { ...item, name } : item);
    setUsers(users);
    setSession({ ...user, name });
    document.querySelectorAll('#studentName').forEach(element => { element.textContent = name; });
    document.getElementById('profileSaved').classList.remove('d-none');
    showToast('success', 'Profile updated successfully.');
  });

  // Password change form handler
  const passwordForm = document.getElementById('passwordForm');
  if (passwordForm) {
    passwordForm.addEventListener('submit', function(event) {
      event.preventDefault();
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('error', 'Please fill all fields.');
        return;
      }
      if (newPassword !== confirmPassword) {
        showToast('error', 'New passwords do not match.');
        return;
      }
      if (newPassword.length < 6) {
        showToast('error', 'New password must be at least 6 characters.');
        return;
      }
      const users = getUsers();
      const userIndex = users.findIndex(u => u.id === user.id);
      if (userIndex === -1) {
        showToast('error', 'User not found.');
        return;
      }
      if (users[userIndex].password !== currentPassword) {
        showToast('error', 'Current password is incorrect.');
        return;
      }
      users[userIndex].password = newPassword;
      setUsers(users);
      setSession({ ...user, password: newPassword });
      passwordForm.reset();
      document.getElementById('passwordSaved').classList.remove('d-none');
      showToast('success', 'Password updated successfully.');
    });
  }
}

function renderAnnouncements() {
  const container = document.getElementById('announcementList');
  const announcements = getAnnouncements();
  container.innerHTML = announcements.slice(0, 3).map(announcement => `
    <div class="announcement-item">
      <span class="announcement-icon ${announcement.type === 'event' ? 'event-icon' : ''}"><i class="bi bi-${announcement.type === 'event' ? 'calendar-event' : 'megaphone'}"></i></span>
      <div><strong>${announcement.title}</strong><small>${announcement.detail}</small></div>
    </div>`).join('');
}

function renderMiniCalendar(monthDate, events) {
  const calendar = document.getElementById('miniCalendar');
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const eventDates = new Set(events.map(event => event.date));
  const cells = [];

  for (let blankDay = 0; blankDay < firstDay; blankDay += 1) cells.push('<span class="calendar-cell empty"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const hasEvent = eventDates.has(dateKey);
    cells.push(`<span class="calendar-cell ${isToday ? 'today' : ''} ${hasEvent ? 'has-event' : ''}">${day}</span>`);
  }

  document.getElementById('calendarMonth').textContent = monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  calendar.innerHTML = cells.join('');
}

function loadStudentAttendance(studentId) {
  const attendance = getAttendance().filter(a => a.studentId === studentId);
  const tbody = document.getElementById('attendanceTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const events = getEvents();
  attendance.forEach(record => {
    const event = events.find(e => e.id === record.eventId) || { name: 'Unknown Event' };
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatDate(record.date)}</td>
      <td>${event.name}</td>
      <td>${record.time}</td>
      <td><span class="badge ${record.status === 'present' ? 'bg-success' : record.status === 'late' ? 'bg-warning text-dark' : 'bg-danger'}">${record.status.charAt(0).toUpperCase() + record.status.slice(1)}</span></td>
    `;
    tbody.appendChild(row);
  });
  toggleEmptyState('emptyState', attendance.length > 0);
}

function loadStudentSanctions(studentId) {
  const sanctions = getSanctions().filter(s => s.studentId === studentId);
  const appeals = getAppeals().filter(appeal => appeal.studentId === studentId);
  const tbody = document.getElementById('sanctionTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  sanctions.forEach(sanction => {
    const appeal = appeals.find(item => item.sanctionId === sanction.id);
    const appealCell = appeal
      ? `<span class="appeal-status ${appeal.status}">${appeal.status}</span>`
      : sanction.status === 'active'
        ? `<a class="appeal-link" href="student-appeal.html?sanction=${encodeURIComponent(sanction.id)}">Appeal</a>`
        : '<span class="text-muted">Not available</span>';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatDate(sanction.date)}</td>
      <td>${sanction.description}</td>
      <td>${severityBadge(sanction.severity)}</td>
      <td><span class="badge bg-${sanction.status === 'active' ? 'danger' : 'secondary'}">${sanction.status}</span></td>
      <td>${appealCell}</td>
    `;
    tbody.appendChild(row);
  });
  toggleEmptyState('emptyState', sanctions.length > 0);
}

function loadAppealForm(studentId) {
  const select = document.getElementById('appealSanction');
  const activeSanctions = getSanctions().filter(sanction => sanction.studentId === studentId && sanction.status === 'active');
  const appeals = getAppeals().filter(appeal => appeal.studentId === studentId);
  const availableSanctions = activeSanctions.filter(sanction => !appeals.some(appeal => appeal.sanctionId === sanction.id && appeal.status === 'pending'));
  select.innerHTML = availableSanctions.length
    ? availableSanctions.map(sanction => `<option value="${sanction.id}">${sanction.description} - ${formatDate(sanction.date)}</option>`).join('')
    : '<option value="">No sanctions available for appeal</option>';
  const requestedSanction = new URLSearchParams(window.location.search).get('sanction');
  if (requestedSanction && availableSanctions.some(sanction => sanction.id === requestedSanction)) select.value = requestedSanction;
  if (!availableSanctions.length) document.getElementById('appealSubmit').disabled = true;

  document.getElementById('appealForm').addEventListener('submit', function(event) {
    event.preventDefault();
    const sanctionId = select.value;
    const reason = document.getElementById('appealReason').value.trim();
    if (!sanctionId || !reason) {
      showToast('error', 'Select a sanction and explain your excuse.');
      return;
    }
    const updatedAppeals = getAppeals().filter(appeal => !(appeal.studentId === studentId && appeal.sanctionId === sanctionId && appeal.status === 'pending'));
    updatedAppeals.push({ id: generateId('appeal'), studentId, sanctionId, reason, status: 'pending', date: new Date().toISOString().slice(0, 10) });
    setAppeals(updatedAppeals);
    document.getElementById('appealForm').reset();
    document.getElementById('appealForm').classList.add('d-none');
    document.getElementById('appealSubmitted').classList.remove('d-none');
    showToast('success', 'Your appeal was submitted for review.');
  });
}