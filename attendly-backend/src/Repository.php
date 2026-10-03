<?php
/**
 * ATTENDLY — Data Access
 *
 * Reads and writes for the entities the frontend needs. Every query
 * uses prepared statements; row shapes are mapped into the camelCase
 * field names js/*.js already expect so the client needs no reshaping.
 */

declare(strict_types=1);

namespace Attendly;

use PDO;

final class Repository
{
    public function __construct(private PDO $db)
    {
    }

    /* ── Users ─────────────────────────────────────────────────── */

    /**
     * List users. Staff see everyone; a student sees only themselves.
     *
     * @return array<int,array<string,mixed>>
     */
    public function listUsers(?array $viewer): array
    {
        if ($viewer !== null && $viewer['role'] === 'student') {
            $stmt = $this->db->prepare(
                'SELECT u.id, u.role, u.username, u.email, u.status,
                        s.student_id_number, s.first_name, s.last_name,
                        s.program, s.year_level, s.section, s.fingerprint_enrolled
                 FROM users u
                 LEFT JOIN students s ON s.user_id = u.id
                 WHERE u.id = :id'
            );
            $stmt->execute(['id' => $viewer['id']]);
            return array_map([$this, 'mapUser'], $stmt->fetchAll());
        }

        $rows = $this->db->query(
            'SELECT u.id, u.role, u.username, u.email, u.status,
                    s.student_id_number, s.first_name, s.last_name,
                    s.program, s.year_level, s.section, s.fingerprint_enrolled,
                    o.position, o.status AS officer_status
             FROM users u
             LEFT JOIN students s ON s.user_id = u.id
             LEFT JOIN ssc_officers o ON o.user_id = u.id
             ORDER BY u.role, u.id'
        )->fetchAll();

        return array_map([$this, 'mapUser'], $rows);
    }

    /**
     * Create a student plus their users row.
     *
     * @param array<string,mixed> $input
     */
    public function createStudent(array $input, array $actor): array
    {
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare(
                'INSERT INTO users (role, username, email, password_hash, status)
                 VALUES (\'student\', :username, :email, :hash, \'active\')'
            );
            $stmt->execute([
                'username' => $input['username'],
                'email'    => $input['email'],
                'hash'     => password_hash($input['password'], PASSWORD_DEFAULT),
            ]);
            $userId = (int) $this->db->lastInsertId();

            $profile = $this->db->prepare(
                'INSERT INTO students
                    (user_id, student_id_number, first_name, last_name, program, year_level, section, fingerprint_enrolled)
                 VALUES (:uid, :idnum, :first, :last, :program, :year, :section, 0)'
            );
            $profile->execute([
                'uid'     => $userId,
                'idnum'   => $input['studentIdNumber'],
                'first'   => $input['firstName'],
                'last'    => $input['lastName'],
                'program' => $input['program'],
                'year'    => (string) $input['yearLevel'],
                'section' => $input['section'],
            ]);

            $this->db->commit();
        } catch (PDOException $e) {
            $this->db->rollBack();
            // 23000 = integrity constraint (duplicate email / id number).
            if ($e->getCode() === '23000') {
                Response::fail('duplicate', 'That email or student ID number is already registered.', 409);
            }
            throw $e;
        }

        $rows = $this->db->prepare(
            'SELECT u.id, u.role, u.username, u.email, u.status,
                    s.student_id_number, s.first_name, s.last_name,
                    s.program, s.year_level, s.section, s.fingerprint_enrolled
             FROM users u LEFT JOIN students s ON s.user_id = u.id WHERE u.id = :id'
        );
        $rows->execute(['id' => $userId]);
        return $this->mapUser($rows->fetch());
    }

    /* ── Events ────────────────────────────────────────────────── */

    /**
     * @return array<int,array<string,mixed>>
     */
    public function listEvents(): array
    {
        $rows = $this->db->query(
            'SELECT id, name, description, event_date, start_time, end_time, venue, event_type, status
             FROM events ORDER BY event_date, start_time'
        )->fetchAll();
        return array_map([$this, 'mapEvent'], $rows);
    }

    /**
     * @param array<string,mixed> $input
     */
    public function createEvent(array $input, array $actor): array
    {
        $stmt = $this->db->prepare(
            'INSERT INTO events (name, description, event_date, start_time, end_time, venue, event_type, status, created_by)
             VALUES (:name, :description, :date, :start, :end, :venue, :type, \'scheduled\', :created_by)'
        );
        $stmt->execute([
            'name'        => $input['name'],
            'description' => $input['description'] ?? null,
            'date'        => $input['date'],
            'start'       => $input['startTime'],
            'end'         => $input['endTime'],
            'venue'       => $input['venue'],
            'type'        => $input['eventType'] === 'optional' ? 'optional' : 'mandatory',
            'created_by'  => $actor['id'],
        ]);

        $id = (int) $this->db->lastInsertId();
        $row = $this->db->prepare('SELECT id, name, description, event_date, start_time, end_time, venue, event_type, status FROM events WHERE id = :id');
        $row->execute(['id' => $id]);
        return $this->mapEvent($row->fetch());
    }

    /**
     * Delete an event. Attendance rows reference events with ON DELETE
     * RESTRICT, so an event that already has check-ins cannot be removed.
     */
    public function deleteEvent(int $eventId): void
    {
        try {
            $stmt = $this->db->prepare('DELETE FROM events WHERE id = :id');
            $stmt->execute(['id' => $eventId]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                Response::fail('event_in_use', 'This event already has attendance records and cannot be deleted.', 409);
            }
            throw $e;
        }
    }

    /* ── Attendance ────────────────────────────────────────────── */

    /**
     * @return array<int,array<string,mixed>>
     */
    public function listAttendance(?int $eventId, ?int $studentId): array
    {
        $sql = 'SELECT a.id, a.event_id, a.student_id, a.check_in_time,
                       a.verification_method, s.student_id_number
                FROM attendance_records a
                JOIN students s ON s.user_id = a.student_id
                WHERE 1 = 1';
        $params = [];

        if ($eventId !== null) {
            $sql .= ' AND a.event_id = :event_id';
            $params['event_id'] = $eventId;
        }
        if ($studentId !== null) {
            $sql .= ' AND a.student_id = :student_id';
            $params['student_id'] = $studentId;
        }
        $sql .= ' ORDER BY a.check_in_time DESC';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return array_map([$this, 'mapAttendance'], $stmt->fetchAll());
    }

    /**
     * Record a check-in. The UNIQUE(event_id, student_id) constraint is
     * the real duplicate guard — a race between two kiosks is rejected by
     * MySQL, not by a prior SELECT.
     *
     * @param array<string,mixed> $input
     */
    public function checkIn(array $input): array
    {
        try {
            $stmt = $this->db->prepare(
                'INSERT INTO attendance_records (event_id, student_id, verification_method)
                 VALUES (:event_id, :student_id, :method)'
            );
            $stmt->execute([
                'event_id'   => $input['eventId'],
                'student_id' => $input['studentId'],
                'method'     => $input['verificationMethod'] === 'manual' ? 'manual' : 'fingerprint',
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                Response::fail('duplicate_checkin', 'This student is already checked in for that event.', 409);
            }
            if ($e->getCode() === '23003') {
                Response::fail('student_not_found', 'No student is registered under that ID.', 404);
            }
            throw $e;
        }

        $id = (int) $this->db->lastInsertId();
        $row = $this->db->prepare(
            'SELECT id, event_id, student_id, check_in_time, verification_method
             FROM attendance_records WHERE id = :id'
        );
        $row->execute(['id' => $id]);
        return $this->mapAttendance($row->fetch());
    }

    /* ── Sanctions ─────────────────────────────────────────────── */

    /**
     * @return array<int,array<string,mixed>>
     */
    public function listSanctions(?int $studentId = null): array
    {
        $sql = 'SELECT sr.id, sr.recommendation_id, sr.student_id, sr.type,
                       sr.decided_by, sr.decision_notes, sr.decided_at, sr.lifted_at,
                       s.first_name, s.last_name, s.student_id_number
                FROM sanction_records sr
                JOIN students s ON s.user_id = sr.student_id
                WHERE sr.lifted_at IS NULL';
        $params = [];
        if ($studentId !== null) {
            $sql .= ' AND sr.student_id = :student_id';
            $params['student_id'] = $studentId;
        }
        $sql .= ' ORDER BY sr.decided_at DESC';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return array_map([$this, 'mapSanction'], $stmt->fetchAll());
    }

    /* ── Row mapping ───────────────────────────────────────────── */

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private function mapUser(array $row): array
    {
        return [
            'id'            => (int) $row['id'],
            'role'          => Auth::clientRole((string) $row['role']),
            'username'      => $row['username'],
            'email'         => $row['email'],
            'status'        => $row['status'],
            'name'          => isset($row['first_name'])
                ? trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')) ?: $row['username']
                : $row['username'],
            'studentIdNumber' => $row['student_id_number'] ?? null,
            'program'       => $row['program'] ?? null,
            'yearLevel'     => $row['year_level'] ?? null,
            'section'       => $row['section'] ?? null,
            'position'      => $row['position'] ?? null,
            'officerStatus' => $row['officer_status'] ?? null,
            'fingerprintEnrolled' => isset($row['fingerprint_enrolled'])
                ? (bool) $row['fingerprint_enrolled']
                : null,
        ];
    }

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private function mapEvent(array $row): array
    {
        // The schema calls this mandatory/optional; the UI's event type is
        // major/minor and it also carries a redundant `mandatory` flag
        // (see loadEventsTable in js/ssc.js). Translating here keeps the
        // database vocabulary out of the markup and stops a hydrated event
        // from rendering as "Optional" with a neutral badge.
        $mandatory = $row['event_type'] === 'mandatory';

        return [
            'id'          => (int) $row['id'],
            'name'        => $row['name'],
            'description' => $row['description'],
            'date'        => $row['event_date'],
            'time'        => substr((string) $row['start_time'], 0, 5),
            'startTime'   => substr((string) $row['start_time'], 0, 5),
            'endTime'     => substr((string) $row['end_time'], 0, 5),
            // The UI column is "location", never "venue".
            'location'    => $row['venue'],
            'type'        => $mandatory ? 'major' : 'minor',
            'mandatory'   => $mandatory,
            // No column stores the recurrence rule; the UI hides the badge
            // when this is falsy, so null is the honest value.
            'recurring'   => null,
            'status'      => $row['status'],
        ];
    }

    /**
     * The frontend models a check-in as a table row with eventId, date,
     * time and a present/late status; the schema stores a timestamp and a
     * verification method, so those are derived here.
     *
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private function mapAttendance(array $row): array
    {
        $checkIn = (string) $row['check_in_time'];
        $time    = substr($checkIn, 11, 5); // "HH:MM:SS" out of the timestamp
        // Late means arriving after 08:15, matching the kiosk's grace period.
        $status  = $time > '08:15' ? 'late' : 'present';

        return [
            'id'                 => (int) $row['id'],
            'eventId'            => (int) $row['event_id'],
            'studentId'          => (int) $row['student_id'],
            'studentIdNumber'    => $row['student_id_number'] ?? null,
            'date'               => substr($checkIn, 0, 10),
            'time'               => $time,
            'status'             => $status,
            'verificationMethod' => $row['verification_method'],
        ];
    }

    /**
     * Sanction rows are stored split across recommendation and decision;
     * the frontend wants one flat record with severity and a lifted/active
     * status.
     *
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private function mapSanction(array $row): array
    {
        $decidedAt = (string) $row['decided_at'];

        return [
            'id'               => (int) $row['id'],
            'studentId'        => (int) $row['student_id'],
            'studentName'      => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
            'studentIdNumber'  => $row['student_id_number'] ?? null,
            'recommendationId' => $row['recommendation_id'] !== null ? (int) $row['recommendation_id'] : null,
            // The schema's `type` ('warning'/'probation') is what the
            // frontend calls `severity`, and it is a subset of the
            // {warning, probation, suspension} set that severityBadge()
            // and severityRank() understand, so it maps across unchanged.
            'severity'         => $row['type'],
            'description'      => $row['decision_notes'] ?? '',
            'date'             => substr($decidedAt, 0, 10),
            // "resolved" is not a database word: the frontend toggles a
            // sanction between 'active' and 'resolved' (see
            // toggleSanctionStatus in js/ssc.js), so lifted_at is
            // translated rather than exposed as 'lifted'.
            'status'           => $row['lifted_at'] === null ? 'active' : 'resolved',
            'decidedBy'        => (int) $row['decided_by'],
            'liftedAt'         => $row['lifted_at'],
        ];
    }
}