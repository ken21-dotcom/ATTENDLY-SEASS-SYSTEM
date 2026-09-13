# ATTENDLY Backend — Design Specification

**Date:** 2026-09-14
**Status:** Approved (in-chat design) → written for sign-off
**Scope:** New `backend/` directory — Express + MySQL REST API. Backend only. `pages/` and `css/` are untouched.
**Team context:** 2-person IT305 capstone (JHCSC Supreme Student Council). Frontend already exists as a static prototype on port 5173; the frontend will be wired to this API in a later pass by the team.

---

## 1. Overview

A server-side, role-enforced REST API for the ATTENDLY student event attendance and sanctions system. Three roles — `student`, `ssc_officer`, `administrator` — each with server-enforced scope. All identity/authorization is session-based; no client-supplied role is ever trusted.

## 2. Goals / Non-goals

**Goals**
- Visible, auditable SQL (mysql2 parameterized queries; no ORM, no query builder).
- Server-side sessions with a MySQL-backed store and HttpOnly cookies (no JWT-in-localStorage).
- Role and ownership scoping enforced in the database layer (repository WHERE clauses), not post-fetch filters and not client promises.
- A database that encodes the business's hard rules as real constraints (e.g., `UNIQUE(event_id, student_id)` on attendance).
- A working, runnable backend on the team's local MySQL 8.0, ready to be wired to the frontend later.

**Non-goals**
- No test framework.
- No `DELETE` routes anywhere (deactivation is the only "removal" primitive).
- No modifications to `pages/` or `css/`.
- No real biometric SDK integration — `device_reference` is an opaque SDK pointer; fingerprint matching itself is out of scope.

## 3. Approved decisions (from clarification)

| Decision | Choice |
|---|---|
| MySQL provisioning | Bootstrap script: `scripts/init-db.sql` + `npm run db:init`, run once as root; least-privilege app user. |
| Migrations | Custom runner — numbered `.sql` files in `db/migrations`, applied in order, tracked in `schema_migrations`. |
| Docker | Skipped. Targets local `MySQL80` at `localhost:3306`. |
| Verify→checkin link | DB-backed one-use `biometric_verifications` rows with a short TTL. |

## 4. Stack & conventions

- Node.js LTS (24.x available), **ESM** (`"type": "module"`).
- **Dependencies:** `express`, `mysql2` (promise pool), `express-session`, `express-mysql-session`, `bcrypt` (cost 12), `dotenv`, `cors`. Nothing else.
- Port **3000** (env-overridable). CORS allows `CLIENT_ORIGIN` (default `http://localhost:5173`) with `credentials: true`.
- Sessions: `express-session`, store `sessions` table via `express-mysql-session`; cookie `HttpOnly, SameSite=Lax, Secure` (only when `NODE_ENV=production`), 8h rolling TTL, cookie name `attendly.sid`.
- JSON validation: hand-rolled `utils/validate.js` — small field checkers returning 422 on failure. No validation framework.
- Error envelope: `{ error: { code, message, details? } }`.
  - 401 unauthenticated · 403 wrong role or inactive user · 404 missing · 409 duplicate/conflict · 422 invalid input · 500 unexpected.
  - `ER_DUP_ENTRY` (MySQL 1062) is mapped to 409 and is the *intended* rejection path for duplicate check-in.
- Timestamps: MySQL `DEFAULT CURRENT_TIMESTAMP` / `ON UPDATE CURRENT_TIMESTAMP`. `utf8mb4` / `utf8mb4_unicode_ci` throughout.

## 5. Architecture & layering

Module-per-feature under `src/modules/<module>/` with a uniform 4-layer split:

```
routes.js      → express Router; path + middleware chain (requireAuth, requireRole) only
controller.js  → HTTP concerns: parse/validate req, call service, map result→res
service.js     → business rules & transactions; the only layer allowed to orchestrate multiple queries
repository.js  → every SQL query lives here; owns scoping WHERE clauses
```

**Layering rules (hard):**
1. Controllers never touch the DB; repositories never touch `req`/`res`.
2. Ownership scoping is a **repository-layer WHERE clause**, never a post-fetch filter in JS.
3. Role checks live in middleware (`requireRole`), reading `req.session.role` — never from the request body.
4. The role↔profile-table invariant (a `students` row implies `users.role = 'student'`, etc.) is maintained transactionally in the service layer when accounts are created.

### Directory / file inventory

```
backend/
  package.json          — deps, scripts (dev, start, db:init, migrate, seed)
  .env.example          — all config keys with safe placeholders (no real secrets)
  .gitignore            — .env, node_modules, logs
  README.md             — setup, configure, migrate, seed, run (see §15)
  src/
    config/env.js       — load + validate dotenv; friendly error on missing DB creds
    config/db.js        — mysql2/promise Pool from env; connectivity probe on boot
    middleware/requireAuth.js    — 401 if no session; loads user; rejects inactive users
    middleware/requireRole.js    — 403 unless req.session.role ∈ allowed
    middleware/errorHandler.js   — central error → JSON envelope incl. MySQL 1062 → 409
    utils/validate.js            — request body validators
    utils/standing.js            — recomputeStanding(student_id) service function
    utils/notifications.js       — notify(userId, type, message, entity) helper
    app.js               — express wiring: json, cors, session, api router, health, 404, errorHandler
    server.js            — boot: env → db probe → ensureAdmin() → app.listen; graceful shutdown
    modules/
      auth/        routes.js controller.js service.js repository.js
      students/    (same four)
      officers/    (same four)
      events/      (same four)
      attendance/  (same four)
      enrollment/  (same four)
      sanctions/   (same four)
      reports/     (same four)
      notifications/ (same four)
  db/
    migrations/    001_users.sql … 007_sessions.sql
    seeds/seed.js            — idempotent demo dataset (JS script, visible SQL constants)
  scripts/
    init-db.sql     — CREATE DATABASE attendly + CREATE USER attendly_app (run once as root)
    migrate.js      — apply pending 0xxx.sql files in order; record in schema_migrations
    seed.js         — runs db/seeds/seed.js
    ensure-admin.js — self-healing default administrator (also called at server boot)
```

## 6. Database schema

All tables `InnoDB`, `utf8mb4`/`utf8mb4_unicode_ci`. Enums are listed below in full. A single schema-changing migration also creates `schema_migrations` for the runner.

### Migration `001_users.sql`
- **users** — `id` INT UNSIGNED AI PK · `role ENUM('student','ssc_officer','administrator')` · `username VARCHAR(50) UNIQUE` · `email VARCHAR(190) UNIQUE` · `password_hash VARCHAR(255)` · `status ENUM('active','inactive') DEFAULT 'active'` · `created_at` · `updated_at`
- **administrators** — `user_id` PK/FK → `users(id)` ON DELETE CASCADE
- **ssc_officers** — `user_id` PK/FK → `users(id)` CASCADE · `position VARCHAR(100)` · `approved_by FK NULL → administrators(user_id)` ON DELETE SET NULL · `approved_at TIMESTAMP NULL` · `status ENUM('pending','approved','deactivated') DEFAULT 'pending'`
- **students** — `user_id` PK/FK → `users(id)` CASCADE · `student_id_number VARCHAR(30) UNIQUE` · `first_name`, `last_name` VARCHAR(100) · `program VARCHAR(100)` · `year_level VARCHAR(20)` · `section VARCHAR(30)` · `fingerprint_enrolled BOOLEAN DEFAULT FALSE`

### Migration `002_events.sql`
- **events** — `id` AI PK · `name VARCHAR(150)` · `description TEXT NULL` · `event_date DATE` · `start_time TIME` · `end_time TIME` · `venue VARCHAR(150)` · `event_type ENUM('mandatory','optional') DEFAULT 'mandatory'` · `status ENUM('scheduled','cancelled','completed') DEFAULT 'scheduled'` · `created_by FK → ssc_officers(user_id)` ON DELETE RESTRICT · `created_at` · `updated_at`. Index `(created_by)`, `(status, event_date)`.

### Migration `003_fingerprint_enrollments.sql`
- **fingerprint_enrollments** — `id` AI PK · `student_id FK → students(user_id)` CASCADE · `device_reference VARCHAR(255)` (opaque SDK template pointer; **never raw biometric data** — documented with a column comment) · `enrolled_by FK → administrators(user_id)` RESTRICT · `enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` · `is_active BOOLEAN DEFAULT TRUE`. Insert here doubles as the audit trail. One active enrollment per student enforced in the service (transaction: deactivate prior active + insert new + flip `students.fingerprint_enrolled`).

### Migration `004_attendance_records.sql`
- **biometric_verifications** — `id` AI PK · `token CHAR(64) UNIQUE` (16 bytes → hex via `crypto.randomBytes`) · `student_id FK → students(user_id)` CASCADE · `expires_at TIMESTAMP` · `consumed_at TIMESTAMP NULL` · `verification_method ENUM('fingerprint','manual')` · `created_by FK → users(id)` RESTRICT · `created_at`
- **attendance_records** — `id` AI PK · `event_id FK → events(id)` RESTRICT · `student_id FK → students(user_id)` CASCADE · `check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP` · `verification_method ENUM('fingerprint','manual')` · `biometric_verification_id FK NULL → biometric_verifications(id)` ON DELETE SET NULL · **`UNIQUE (event_id, student_id)`** (a real DB constraint — duplicate check-in is rejected by MySQL, not by an app-level SELECT).

### Migration `005_sanctions.sql`
- **sanction_thresholds** — `id` AI PK · `min_absences INT` · `max_absences INT NULL` (NULL = open-ended top tier) · `standing_label VARCHAR(100)` · `configured_by FK → administrators(user_id)` RESTRICT · `created_at` · `CHECK (min_absences >= 0 AND (max_absences IS NULL OR max_absences >= min_absences))`
- **student_standing** — `student_id PK/FK → students(user_id)` CASCADE · `absence_count INT DEFAULT 0` · `current_standing VARCHAR(100)` · `last_computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`. **Derived/cached only** — no endpoint writes it; the recompute service is the sole writer.
- **sanction_recommendations** — `id` AI PK · `student_id FK → students(user_id)` CASCADE · `recommended_by FK → ssc_officers(user_id)` RESTRICT · `reason TEXT` · `severity ENUM('low','medium','high') DEFAULT 'medium'` · `related_absence_count INT DEFAULT 0` · `status ENUM('pending','finalized','overridden') DEFAULT 'pending'` · `decision_notes TEXT NULL` (records admin reasoning on dismiss) · `created_at`
- **sanction_records** — `id` AI PK · `recommendation_id FK NULL → sanction_recommendations(id)` ON DELETE SET NULL · `student_id FK → students(user_id)` CASCADE · `type ENUM('warning','probation')` · `decided_by FK → administrators(user_id)` RESTRICT · `decision_notes TEXT NULL` · `decided_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` · `lifted_at TIMESTAMP NULL` · **`UNIQUE (recommendation_id)`** (prevents double-finalizing one recommendation).

### Migration `006_notifications.sql`
- **notifications** — `id` AI PK · `user_id FK → users(id)` CASCADE · `type VARCHAR(50)` · `message TEXT` · `related_entity_type VARCHAR(50) NULL` · `related_entity_id INT NULL` · `is_read BOOLEAN DEFAULT FALSE` · `created_at`. Index `(user_id, is_read, created_at)`.

### Migration `007_sessions.sql`
- **sessions** — schema required by `express-mysql-session`: `session_id VARCHAR(128)` PK (utf8mb4_bin) · `expires INT UNSIGNED` · `data MEDIUMTEXT` (utf8mb4_bin). Created explicitly here (the store can also auto-create it) for full auditability.

## 7. Endpoints (all under `/api`)

Auth middleware applies to every route below except `POST /login`. Role of `*` means "any authenticated role". `requireAuth` also rejects users whose `status` is `inactive`.

| # | Route | Method | Roles | Notes |
|---|---|---|---|---|
| 1 | `/login` | POST | public | body `{email \| username, password}` → `200 {user, profile}`; `req.session.regenerate()` then store `userId` + `role` |
| 2 | `/logout` | POST | `*` | destroy session → 204 |
| 3 | `/me` | GET | `*` | session user + role profile (student record / officer record / admin) |
| 4 | `/students` | POST | admin | create user(role=student) + students row in one transaction |
| 5 | `/students/:id` | PUT | admin | edit student profile fields |
| 6 | `/students/:id/deactivate` | PATCH | admin | `users.status = 'inactive'` |
| 7 | `/students` | GET | officer (own scope) / admin | officer: distinct students with attendance in that officer's own events; admin: all |
| 8 | `/officers` | POST | admin | create user(role=ssc_officer, status=pending) + ssc_officers row |
| 9 | `/officers/:id` | PUT | admin | body `{action:'approve'}` approves (sets admin + approved_at) or plain edits profile |
| 10 | `/officers/:id/deactivate` | PATCH | admin | `ssc_officers.status = 'deactivated'` (+ user inactive) |
| 11 | `/enrollment/students/:id/fingerprint` | POST | admin | enroll/re-enroll; body `{device_reference}`; deactivates prior active, inserts new, syncs `students.fingerprint_enrolled` |
| 12 | `/enrollment/admin/enrollment-audit` | GET | admin | all fingerprint_enrollments joined with student + enroller names, active flag |
| 13 | `/events` | POST | officer | `created_by` = session user; admin is read-only on events |
| 14 | `/events/:id` | PUT | officer (own) | repository `WHERE id=? AND created_by=?` |
| 15 | `/events/:id/cancel` | PATCH | officer (own) | sets `status='cancelled'`; runs recompute for affected students; notifies attendees |
| 16 | `/events` | GET | officer (own) / admin | scoped list with filter `?status=` |
| 17 | `/biometric/verify` | POST | `*` | body `{student_id_number, method}` → one-use token (see §9) |
| 18 | `/checkin` | POST | `*` | body `{token, event_id}` → attendance insert via DB constraint (see §9) |
| 19 | `/attendance?event_id=` | GET | officer (own event) / admin (any) | roster for one event |
| 20 | `/sanctions/students/:id/standing` | GET | student (self only) / officer (own scope) / admin | cached `student_standing` + label |
| 21 | `/sanctions/recommend` | POST | officer | body `{student_id, reason, severity?}`; status pending |
| 22 | `/sanctions?scope=own\|all` | GET | officer=own / admin=`all` | recommendations |
| 23 | `/sanctions/:id/finalize` | PATCH | admin | body `{decision:'warning'\|'probation'\|'dismiss', notes}` (see §10) |
| 24 | `/sanctions/thresholds` | PATCH | admin | replaces tiers transactionally; recomputes all standing — **addition beyond the spec'd list, required to make the "recompute on threshold change" rule reachable** |
| 25 | `/reports/students/:id/attendance-history` | GET | student (self) / officer (own scope) / admin | records + joined event info |
| 26 | `/reports/events/:id` | GET | officer (own) / admin | event info + attendees + count |
| 27 | `/reports/system-wide` | GET | admin | aggregates: totals, per-event attendance, standing distribution, sanction counts |
| 28 | `/notifications` | GET | `*` (own) | own list, newest first |
| 29 | `/notifications/:id/read` | PATCH | `*` (own) | mark read; repository scopes by `user_id = session` |
| — | `/health` | GET | public | `{ ok: true }` + DB ping |

Module mount points: auth `/api`; students `/api/students`; officers `/api/officers`; enrollment `/api/enrollment`; events `/api/events`; attendance (verify+checkin+list) `/api`; sanctions `/api/sanctions`; reports `/api/reports`; notifications `/api/notifications`.

## 8. Business rules and where they are enforced

| Rule | Enforced at |
|---|---|
| Students see only their own records; self-scoped reads use **session user ID**, never a client-supplied ID | repository WHERE `user_id = sessionUser`; controller ignores/refuses foreign ids for self endpoints |
| Officers scoped to own `created_by` records | repository WHERE `created_by = sessionUser` for event/attendance/report reads-and-writes (edit/cancel re-check ownership) |
| Only mandatory-event attendance counts toward absence/standing; cancelled events excluded entirely | `utils/standing.js` SQL counts mandatory `status='completed'` events with no attendance record |
| Standing recompute runs after: new attendance record, event cancellation, threshold change | service layer calls `recomputeStanding` in the same transaction; also runs once per student at creation |
| Recommendations stay `pending` until admin finalize | `finalize` is the only writer that flips status; officers have no finalize route |
| Students have no PATCH/DELETE on their own attendance/sanctions | those routes do not exist; role+scope middleware rejects them regardless of client behavior |
| Duplicate check-in rejected by the DB, not an app SELECT | `UNIQUE(event_id, student_id)` + `ER_DUP_ENTRY → 409` |
| Role never client-supplied | `requireRole` reads `req.session.role` only |
| Sanctions only become official via admin finalize | `sanction_records` rows created only inside `finalize` |
| Fingerprint rows double as audit trail | every enroll/re-enroll inserts a `fingerprint_enrollments` row; reads via `/admin/enrollment-audit` |

## 9. Kiosk verify → checkin sequence

1. `POST /api/biometric/verify` body `{student_id_number, method:'fingerprint'|'manual'}`.
   - requireAuth (any role). Look up student by number; require `users.status='active'`, `students.fingerprint_enrolled = true`, and an active `fingerprint_enrollments` row.
   - Insert `biometric_verifications`: `token = crypto.randomBytes(16).toString('hex')`, `expires_at = NOW() + 60s` (TTL is a service constant), `created_by = sessionUserId`.
   - Return `{ token, student: {id, student_id_number, first_name, last_name}, expires_at }`. Any prior unconsumed token for that student is invalidated (one active token per student).
2. `POST /api/checkin` body `{token, event_id}`.
   - requireAuth (any role). Reject if token missing/unconsumed/expired, or event is `cancelled` (or student/user not active).
   - `INSERT INTO attendance_records (event_id, student_id, verification_method, biometric_verification_id)` using the token's bound student (the session user cannot choose the student). `UNIQUE(event_id, student_id)` is the sole duplicate guard; `ER_DUP_ENTRY` → 409 with a clean "already checked in" message.
   - Mark the verification consumed (`consumed_at = NOW()`), then `recomputeStanding(student)` in the same transaction, then notify the student.
   - Returns the created record + 201.
3. The token is one-use and expires server-side purely by DB check (`consumed_at IS NULL AND expires_at > NOW()`); a fresh verify invalidates prior tokens for that student.

## 10. Sanction lifecycle

- Officer `POST /recommend` → insert recommendation `status='pending'`, snapshot `related_absence_count` from current standing, notify all admins.
- Admin `PATCH /:id/finalize` body `{decision, notes}`:
  - `decision='warning'|'probation'` → insert `sanction_records(type, decided_by, decision_notes, decided_at)` and set recommendation `status='finalized'` (guarded by `UNIQUE(recommendation_id)`), notify student.
  - `decision='dismiss'` → set recommendation `status='overridden'`, store `decision_notes` on the recommendation, notify student. No `sanction_records` row.
- `GET /sanctions?scope=` — officer sees only `recommended_by = me`; admin sees all (or own). Officer can never see other officers' recommendations.

## 11. Standing recompute (`utils/standing.js`)

```
absence_count =
  SELECT COUNT(*)
  FROM events e
  LEFT JOIN attendance_records a
    ON a.event_id = e.id AND a.student_id = :studentId
  WHERE e.event_type = 'mandatory'
    AND e.status = 'completed'        -- future scheduled events are NOT absences
    AND a.id IS NULL                  -- student has no attendance record

current_standing = label of the threshold tier where min <= count <= max
                  (max NULL → open-ended top tier; any count above all tiers → top tier)
```
Upsert into `student_standing` (`INSERT ... ON DUPLICATE KEY UPDATE`), set `last_computed_at = NOW()`. Called within the same transaction as: check-in insert, event cancellation, threshold change. Also computed once at student creation.

## 12. Notification triggers (service layer)

| Trigger | Recipient |
|---|---|
| Fingerprint enrolled / re-enrolled | the student |
| Recommendation created | all administrators |
| Recommendation finalized / overridden | the student |
| Event cancelled | students with attendance records for that event |

## 13. Security model

- Passwords: bcrypt cost 12; compared with `bcrypt.compare`; never logged.
- Sessions: `regenerate()` on login (session-fixation guard); `userId` + `role` stored server-side only.
- Cookies: `HttpOnly`; `SameSite=Lax` (front end and API are same-site across ports); `Secure` in production.
- SQL: parameterized queries throughout (mysql2 `?` / `:named`). Repository is the only place SQL is written.
- CORS: allow `CLIENT_ORIGIN` only, with `credentials: true`.
- Every protected route = `requireAuth` + specific `requireRole`, applied server-side. No route trusts a body-provided role, student id (for self routes), or event ownership claim.
- `.env` is gitignored (root `.gitignore` already matches).

## 14. Configuration (`backend/.env.example`)

```
# Server
PORT=3000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173

# Database (match scripts/init-db.sql)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=attendly
DB_USER=attendly_app
DB_PASSWORD=change_this
DB_CONNECTION_LIMIT=10

# Session
SESSION_SECRET=change_this_to_a_long_random_string
SESSION_COOKIE_NAME=attendly.sid
SESSION_TTL_MS=28800000

# Self-healing default admin (used only when no active admin exists)
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=password123
```
`config/env.js` validates presence of DB creds and session secret with a friendly startup error pointing at `.env.example`.

## 15. README outline (`backend/README.md`)

1. Prereqs (Node 20+, MySQL 8.0 local)
2. `npm install`
3. `copy .env.example .env` and fill DB + session values
4. `npm run db:init` (one-time, as MySQL root)
5. `npm run migrate`
6. `npm run seed`
7. `npm start` / `npm run dev` (nodemon not required — `node --watch`)
8. Smoke test curl examples (login, me, verify, checkin)
9. Demo accounts table
10. Scripts table (`db:init`, `migrate`, `migrate:status`, `seed`, `start`, `dev`)

## 16. Rejected alternatives

- **JWT / localStorage tokens** — violates the explicit session requirement; not server-revocable.
- **ORM / query builder (Prisma, Sequelize, Knex)** — hides the SQL the team must audit for the capstone.
- **Docker** — the team already runs MySQL 8.0 natively on Windows (approved decision §3).
- **In-memory verify tokens** — lost on restart, not auditable (approved decision §3).
- **Post-fetch role/ownership filtering** — rejected as a scoping pattern; ownership lives in the repository WHERE clauses.
- **SQLite/other DB** — SRS targets MySQL and team runs MySQL80.

## 17. Acceptance checklist (traceability vs. the brief)

Each item maps to a file or behavior so the reviewer and the team can cross-check the SRS:

- [ ] `scripts/init-db.sql` + `db:init` — bootstrap provisioning (§3, §14)
- [ ] Migrations `001`–`007` — every required table present with required relationships/constraints (§6)
- [ ] `scripts/ensure-admin.js` — self-healing admin at boot and in seed (§18)
- [ ] `utils/standing.js` — absence formula, mandatory+completed only, cancelled excluded (§11)
- [ ] auth module — `/login`, `/logout`, `/me` (§7 rows 1–3)
- [ ] students module — admin writes, officer read-scope (§7 rows 4–7)
- [ ] officers module — admin writes/approve/deactivate, no officer self-admin (§7 rows 8–10)
- [ ] enrollment module — enroll/re-enroll + audit endpoint, enrollment-as-audit-trail (§7 rows 11–12, §8)
- [ ] events module — officer-owned CRUD/cancel, admin read-only (§7 rows 13–16)
- [ ] attendance module — verify + checkin via DB-constraint duplicate rejection + one-use token (§7 rows 17–19, §9)
- [ ] sanctions module — standing, recommend (pending), scoped list, admin finalize, thresholds (§7 rows 20–24, §10)
- [ ] reports module — attendance-history, per-event, system-wide (§7 rows 25–27)
- [ ] notifications module — own-list + mark-read + creation triggers (§7 rows 28–29, §12)
- [ ] Repository scoping — every officer/student query carries ownership/self WHERE (§8)
- [ ] `db/seeds/seed.js` — idempotent demo accounts/events/thresholds (§18)
- [ ] `backend/README.md` — full setup/run instructions (§15)

## 18. Seeds & self-healing admin

- **`scripts/seed.js`** (runs `db/seeds/seed.js`): idempotent (`INSERT ... ON DUPLICATE KEY UPDATE`). Creates the three demo accounts from the frontend README — `student@example.com`, `officer@example.com`, `admin@example.com` (all `password123`, bcrypt-hashed at runtime) — plus one fingerprint-enrolled demo student, a mandatory/completed event and an optional/scheduled event, one enrollment audit row, and the default threshold tiers (0–2 Good Standing / 3–4 Warning / 5+ Probation). Passwords are generated in JS; SQL stays visible as readable constants.
- **`scripts/ensure-admin.js`**: if `SELECT COUNT(*) FROM users WHERE role='administrator' AND status='active'` is 0, create the administrator from the `DEFAULT_ADMIN_*` env values (documented fallback `admin@example.com / password123`). Called at server boot (in `server.js`) and by `scripts/seed.js`. Never depends on a human manually creating an account.

## 19. Defaults chosen (approved as veto points; changeable)

1. Port 3000; session TTL 8h rolling; cookie `HttpOnly, SameSite=Lax`, `Secure` in prod.
2. `verification_method = fingerprint | manual` (manual = dev-mode kiosk selector).
3. Verify-token TTL 60s, one use.
4. Threshold seed 0–2 Good Standing / 3–4 Warning / 5+ Probation (open-ended top tier).
5. Recommendation severity `low | medium | high`, default `medium`.
6. Absence formula counts only mandatory **completed** events (§11).
7. Kiosk endpoints accept any authenticated role.
8. Admin is read-only on events and attendance.

## 20. Open items

None. All decisions resolved in §3 and §19.