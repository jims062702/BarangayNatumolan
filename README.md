# Barangay Natumolan Management Information System

An Integrated eBarangay MIS for **Barangay Natumolan, Tagoloan, Misamis
Oriental** — a public landing site, a resident portal, and role-based
dashboards for every barangay office, plus the SK youth organization.

```
Barangay Natumolan/
├── frontend/   # React 19 + Vite + TypeScript + Tailwind v4 (SPA)
└── backend/    # Laravel 12 + Sanctum + MySQL (REST API)
```

## What it includes

- **Public landing page** (`/`) — hero carousel, news & announcements, about,
  services, offices, officials, and contact. The **News & Announcements**,
  **home-section pictures**, and **officials** shown here are managed by the SK
  organization from inside the system (with bundled defaults as a fallback).
- **Resident portal** (`/portal`) — residents track service requests, book
  appointments, view their certificates, read announcements, and use the
  AI-assisted service guide. Accounts are issued by the Population Office.
- **Office dashboards** (`/dashboard`) — a distinct dashboard per audience:
  - **Main Office** — certificates, requests & queue, appointments, records.
    The **Punong Barangay** approves certificates; the **Clerk handles
    certificates only**.
  - **VAWC Desk** — confidential, isolated case management (encrypted notes,
    access logging). Never routed to Lupon.
  - **Lupon Tagapamayapa** — KP case docket, hearings, and settlements with the
    10-day repudiation countdown.
  - **Population Office (BPO)** — the resident/household registry, demographics,
    sectoral lists, and portal-account issuance. **Only the BPO can add
    residents.**
  - **Health Station** — patient visits, immunization, maternal & child health.
  - **Sangguniang Kabataan (SK)** — the youth **organization** (not an office)
    that publishes the barangay's news & announcements and curates the public
    landing content.
  - **Admin** — staff accounts and system configuration.

## Prerequisites

- **Node.js 20+** and npm (frontend)
- **PHP 8.2+**, **Composer 2**, and **MySQL/MariaDB** (backend — XAMPP works)

## Running it (development)

Start MySQL first (e.g. from the XAMPP Control Panel), then:

```bash
# 1) Backend  →  http://127.0.0.1:8000
cd backend
composer install
php artisan storage:link
php artisan config:clear
php artisan migrate --seed        # creates & seeds the barangay_natumolan DB
php artisan serve

# 2) Frontend →  http://localhost:5173
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and sign in from the landing page's login icon.

## Demo logins (password: `password`)

| Role | Email |
|---|---|
| Punong Barangay | pb@natumolan.local |
| Secretary | secretary@natumolan.local |
| Clerk (certificates only) | clerk@natumolan.local |
| VAWC Officer | vawc@natumolan.local |
| Lupon Secretary | lupon@natumolan.local |
| Population Worker (BPO) | population@natumolan.local |
| Health Personnel | health@natumolan.local |
| SK Chairperson | sk@natumolan.local |
| Admin | admin@natumolan.local |
| Resident (portal) | resident.juan@natumolan.local |

## Performance (built-in)

The system is tuned so the public site and dashboards stay fast as the
registry grows (Natumolan serves 20k+ residents):

- **Server-side caching** — the public landing endpoints (home pictures,
  officials, news) are cached and rebuilt only when the SK office changes
  something, so thousands of visitors don't each hit the database.
- **Database indexes** on the columns used for resident search and filters
  (last name, first name, purok) plus all reference numbers and statuses.
- **Paginated lists** everywhere — no endpoint ever returns the whole
  20k-resident registry in one response.
- **Code-split frontend** — visitors download only the page they open; the
  big libraries are cached separately by the browser, and landing content is
  remembered per browser session so refreshes render instantly.
- **PHP OPcache** enabled in `C:\xampp8.2\php\php.ini` (compiled PHP kept in
  memory — roughly 3× faster responses). If you move machines, re-enable
  `zend_extension=opcache` + `opcache.enable=1` there.
- **8 dev-server workers** (`PHP_CLI_SERVER_WORKERS=8` in `backend/.env`) so
  `php artisan serve` handles simultaneous requests instead of one at a time.

## Going live (handling many users at once)

`php artisan serve` and `npm run dev` are development servers. For real
deployment to the whole barangay:

1. **Serve PHP through Apache** (already in XAMPP) or any real web server —
   it handles hundreds of simultaneous connections, unlike `artisan serve`.
   Point a vhost's document root at `backend/public`.
2. **Build the frontend once** with `cd frontend && npm run build`, then serve
   the static `frontend/dist` folder from Apache. Static files cost almost
   nothing per visitor.
3. **Cache Laravel's bootstrap** after every deploy/config change:
   `php artisan config:cache && php artisan route:cache`
   (run `config:clear`/`route:clear` before changing `.env` or routes again).
4. In `backend/.env` set `APP_ENV=production` and `APP_DEBUG=false`.

With the caching above, the heavy public traffic (landing page views) barely
touches MySQL — only the staff dashboards and resident portal run live
queries, and those are paginated and indexed.

## Documentation

- **API reference, access-control matrix, and endpoint map:** [`backend/README.md`](backend/README.md)

## Notes

- The backend must be running (and MySQL up) for logins, data, and uploaded
  images to work; the landing page falls back to bundled content when the API
  is unavailable.
- `php artisan migrate --seed` is additive; use `migrate:fresh --seed` only when
  you intend to wipe and rebuild the database.
