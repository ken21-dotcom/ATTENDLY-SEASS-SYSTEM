/* ============================================================
   Kiosk — self-service event check-in (no login required)
   ------------------------------------------------------------
   State machine: idle → scanning → processing → (success | error)
   Identity comes from FingerprintScanner (simulated until the real
   device is wired in). Attendance is recorded only after a verified
   scan, matching BR-007.

   Security: all user-supplied strings are escaped via escapeHtml()
   before being injected into innerHTML. The manual entry form
   accepts student ID or email — both are validated server-side
   in production, here we just match against the users collection.
   ============================================================ */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // Kiosk UI element references
  let els = {};
  let currentEventId = null;
  let busy = false; // true while a scan is in flight — blocks input

  // ── Event loading ──
  function loadKioskEvents() {
    const events = (getEvents() || []).filter((e) => (e.status || 'scheduled') !== 'cancelled');
    const select = els.event;
    select.innerHTML = events.length
      ? events.map((event) =>
          `<option value="${escapeHtml(event.id)}">${escapeHtml(event.name)} · ${formatDate(event.date)} · ${escapeHtml(event.time)}</option>`
        ).join('')
      : '<option value="">No events available</option>';

    if (events.length) {
      currentEventId = events[0].id;
      select.value = currentEventId;
    } else {
      currentEventId = null;
    }
    renderEventHeader();
    updateCounts();
  }

  function renderEventHeader() {
    const event = getEvents().find((e) => e.id === currentEventId);
    if (!event) {
      els.eventName.innerHTML = 'No event selected.';
      els.eventMeta.textContent = 'Create an event in the SSC dashboard, then return here.';
      return;
    }
    // Live vs scheduled vs cancelled
    const isToday = event.date === todayStr();
    els.eventName.innerHTML = `${escapeHtml(event.name)}<br>`;

    const parts = [`${formatDate(event.date)} · ${escapeHtml(event.time)}`];
    if (event.location) parts.push(escapeHtml(event.location));
    if (event.mandatory) parts.push('Mandatory');
    else parts.push('Optional');
    els.eventMeta.textContent = parts.join(' · ');

    const statusChip = els.statusChip;
    if (event.status === 'cancelled') {
      statusChip.textContent = 'Cancelled';
      statusChip.classList.add('is-cancelled');
    } else {
      statusChip.textContent = isToday ? 'Live now' : 'Upcoming';
      statusChip.classList.remove('is-cancelled');
    }
  }

  function updateCounts() {
    const attendance = getAttendance();
    const checkedIn = currentEventId
      ? attendance.filter((a) => a.eventId === currentEventId && (a.status === 'present' || a.status === 'late')).length
      : 0;
    els.count.textContent = checkedIn;

    const enrolled = (getBiometrics() || []).filter((b) => b.status === 'enrolled').length;
    els.listCount.textContent = enrolled || getUsers().filter((u) => u.role === 'student').length;
  }

  // ── Status rendering — drives the kiosk scan panel ──
  function setStatus(state, text, hint) {
    const scanner = els.scanner;
    scanner.dataset.state = state;
    if (text !== undefined) els.statusText.textContent = text;
    if (hint !== undefined) els.scanHint.textContent = hint;
  }

  // ── Recording attendance (FR-005/006, BR-007/008) ──
  function recordAttendance(student) {
    const attendance = getAttendance();
    const already = attendance.some((a) => a.studentId === student.id && a.eventId === currentEventId);
    if (already) return 'duplicate';

    const now = new Date();
    attendance.push({
      id: generateId('att'),
      studentId: student.id,
      eventId: currentEventId,
      date: todayStr(),               // FIX: local date, not UTC
      time: now.toTimeString().slice(0, 5),
      status: 'present',
      excused: false,
      excuseReason: ''
    });
    setAttendance(attendance);
    return 'ok';
  }

  // ── Result overlay (success / error) ──
  const RESULT_ICONS = {
    success:       'check-circle-fill',
    'already':     'exclamation-triangle-fill',
    'no-match':    'x-circle-fill',
    'not-enrolled': 'x-circle-fill',
    'device-error': 'x-circle-fill',
    'no-event':     'info-circle-fill',
  };

  function showResult(type, title, message, meta) {
    els.resultIcon.className = `bi bi-${RESULT_ICONS[type] || 'info-circle-fill'} kiosk-result-icon is-${type}`;
    els.resultTitle.textContent = title;
    els.resultMessage.textContent = message;
    // meta is controlled HTML from our code — safe to use innerHTML
    els.resultMeta.innerHTML = meta || '';
    els.resultOverlay.hidden = false;
    els.resultDone.focus();
  }

  // ── Fingerprint check-in flow ──
  async function runFingerprintScan() {
    if (busy) return;
    const event = getEvents().find((e) => e.id === currentEventId);
    if (!event) {
      showResult('no-event', 'No event selected', 'Choose an event before scanning.', '');
      return;
    }

    busy = true;
    setStatus('scanning', 'Scanning…', 'Place your finger on the reader and hold it there.');
    els.resultOverlay.hidden = true;

    const scanner = window.FingerprintScanner;
    let result = null;

    try {
      result = await scanner.scan();
      setStatus('processing', 'Verifying fingerprint…', 'Matching your template. Hold still.');

      // Small beat so the "processing" state is perceivable (~0.6s).
      await sleep(650);

      const student = getUsers().find((u) => u.id === result.studentId);
      if (!student) {
        showResult('no-match', 'No record found', 'This fingerprint did not match an enrolled student.', '');
        setStatus('error', 'Verification failed', 'Please try again.');
        return;
      }

      const outcome = recordAttendance(student);
      if (outcome === 'duplicate') {
        showResult('already', 'Already checked in', `${escapeHtml(student.name)} is already present for this event.`, '');
        setStatus('attention', 'Already checked in', 'No action needed.');
      } else {
        showResult(
          'success',
          `Welcome, ${escapeHtml(student.name.split(' ')[0])}!`,
          'Attendance recorded.',
          `<strong>${escapeHtml(event.name)}</strong> · ${new Date().toLocaleTimeString()}`
        );
        setStatus('success', 'Checked in', 'Attendance saved. You can go ahead.');
        updateCounts();
      }
    } catch (err) {
      const code = err.code || 'device-error';
      const map = {
        'no-match':       ['Cannot identify you', 'Try again with another finger or contact the SSC booth.'],
        'not-enrolled':   ['Not enrolled', 'Your fingerprint is not on file. Visit the SSC booth for enrollment or use manual entry.'],
        'device-error':   ['Scanner unavailable', 'The reader is offline. Use manual entry or try again shortly.']
      };
      const [title, message] = map[code] || ['Scan failed', 'Something went wrong. Try again.'];
      showResult(code === 'no-match' ? 'no-match' : code, title, message, '');
      setStatus('error', title, message);
    } finally {
      busy = false;
    }
  }

  // ── Manual override (fallback when no enrolled fingerprint) ──
  function runManualEntry(rawId) {
    const id = (rawId || '').trim();
    const event = getEvents().find((e) => e.id === currentEventId);
    if (!event || !id) return;

    const student = getUsers().find((u) => u.role === 'student' && (u.id === id || u.email === id));
    if (!student) {
      showToast('error', 'Student not found.');
      return;
    }
    const outcome = recordAttendance(student);
    if (outcome === 'duplicate') {
      showToast('warning', `${escapeHtml(student.name)} is already checked in.`);
      showResult('already', 'Already checked in', `${escapeHtml(student.name)} is already present for this event.`, '');
    } else {
      showResult(
        'success',
        `Welcome, ${escapeHtml(student.name.split(' ')[0])}!`,
        'Manual attendance recorded.',
        `<strong>${escapeHtml(event.name)}</strong> · ${new Date().toLocaleTimeString()}`
      );
      showToast('success', `${escapeHtml(student.name)} checked in.`);
      updateCounts();
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ── Clock ──
  function tickClock() {
    const now = new Date();
    els.clockTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    els.clockDate.textContent = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ── Boot ──
  function init() {
    els = {
      event:        $('kioskEvent'),
      eventName:    $('kioskEventName'),
      eventMeta:    $('kioskEventMeta'),
      statusChip:   $('kioskStatusChip'),
      scanner:      $('kioskScanner'),
      statusText:   $('kioskStatusText'),
      scanHint:     $('kioskScanHint'),
      count:        $('kioskCount'),
      listCount:    $('kioskListCount'),
      resultOverlay: $('resultOverlay'),
      resultIcon:   $('resultIcon'),
      resultTitle:  $('resultTitle'),
      resultMessage: $('resultMessage'),
      resultMeta:   $('resultMeta'),
      resultDone:   $('resultDone'),
      manualToggle: $('manualToggle'),
      manualBody:   $('manualBody'),
      manualForm:   $('kioskManualForm'),
      manualId:     $('manualStudentId'),
      clockTime:    $('kioskClockTime'),
      clockDate:    $('kioskClockDate')
    };

    loadKioskEvents();

    els.event.addEventListener('change', () => {
      currentEventId = els.event.value;
      renderEventHeader();
      updateCounts();
    });

    // The whole scanner ring is the "press to scan" affordance, plus a
    // dedicated large hit area. Touch + mouse both work.
    els.scanner.addEventListener('click', () => {
      if (!busy) runFingerprintScan();
    });

    // Manual entry collapse
    if (els.manualToggle) {
      els.manualToggle.addEventListener('click', () => {
        const expanded = els.manualToggle.getAttribute('aria-expanded') === 'true';
        els.manualToggle.setAttribute('aria-expanded', String(!expanded));
        els.manualBody.hidden = expanded;
      });
    }

    if (els.manualForm) {
      els.manualForm.addEventListener('submit', (e) => {
        e.preventDefault();
        runManualEntry(els.manualId.value);
        els.manualId.value = '';
      });
    }

    if (els.resultDone) {
      els.resultDone.addEventListener('click', () => {
        els.resultOverlay.hidden = true;
        setStatus('idle', 'Waiting for scan', 'Place your finger on the reader to check in.');
      });
    }

    // Auto-start fingerprint device when available (no-op in simulation).
    if (window.FingerprintScanner) {
      window.FingerprintScanner.start().catch(() => {});
    }

    tickClock();
    setInterval(tickClock, 1000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();