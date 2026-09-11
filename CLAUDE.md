# Project: Student Attendance System (Prototype)

This is the `prototype` working directory containing the Student Attendance System — a static HTML/CSS/JS app with a biometric kiosk, SSC management dashboards, and student portals.

## Structure

- `index.html` — entry point; redirects to `student-attendance-system/pages/login.html`
- `student-attendance-system/` — the full app
  - `pages/` — HTML pages (login, kiosk, SSC dashboards, student portals)
  - `css/` — stylesheets (variables, auth, kiosk, dashboards, etc.)
  - `js/` — application logic (auth, kiosk, student, admin, ui, data)
  - `images/` — static assets

## PM2 Services

| Port | Name | Type |
|------|------|------|
| 5173 | prototype-5173 | Static HTML |

**Terminal Commands:**
```bash
pm2 start ecosystem.config.cjs   # First time
pm2 start all                    # After first time
pm2 stop all / pm2 restart all
pm2 start prototype-5173 / pm2 stop prototype-5173
pm2 logs / pm2 status / pm2 monit
pm2 save                         # Save process list
pm2 resurrect                    # Restore saved list
```