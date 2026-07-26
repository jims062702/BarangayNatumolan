# Barangay Natumolan MIS — Backend (Laravel 12 API)

REST API for the Integrated eBarangay Management Information System. Token
auth via Laravel Sanctum, MySQL database, role/office access control.

## Requirements

- PHP 8.2+ with `pdo_mysql`, `mbstring`, `openssl`, `zip`, `fileinfo`, `gd`
- Composer 2
- MySQL/MariaDB running (XAMPP is fine) with a database named `barangay_natumolan`

## Setup

```bash
cd backend
composer install
# .env targets mysql / barangay_natumolan on 127.0.0.1:3306 (root, no password)
# APP_URL must be http://localhost:8000 so uploaded image URLs resolve.
php artisan storage:link       # exposes uploaded images at /storage
php artisan config:clear       # config is cached — always clear after .env edits
php artisan migrate --seed     # first run; use migrate:fresh --seed only to wipe & rebuild
php artisan serve              # http://127.0.0.1:8000
```

CORS is preconfigured for the Vite dev origins `http://localhost:5173` and
`http://127.0.0.1:5173`. Uploaded images (home pictures, official photos, news
photos) are stored under `storage/app/public` and served from `/storage`.

## Seeded accounts (password: `password`)

| Email | Role | Office / Group |
|---|---|---|
| pb@natumolan.local | Punong Barangay | Main Office |
| secretary@natumolan.local | Secretary | Main Office |
| clerk@natumolan.local | Clerk | Main Office (certificates only) |
| vawc@natumolan.local | VAWC Officer | VAWC |
| lupon@natumolan.local | Lupon Secretary | Lupon |
| population@natumolan.local | Population Worker | Population (BPO) |
| health@natumolan.local | Health Personnel | Health Station |
| sk@natumolan.local | SK Chairperson | Sangguniang Kabataan |
| admin@natumolan.local | Admin | Admin |
| resident.juan@natumolan.local | Resident | (portal) |
| resident.liza@natumolan.local | Resident | (portal) |

> **Note:** The SK (Sangguniang Kabataan) is the barangay **youth organization**,
> not an office. In this system it is the content manager for the public
> landing page — news & announcements, home-section pictures, and the officials
> list. (The former CDC office has been removed.)

## Access control

Enforced by `App\Http\Middleware\OfficeMiddleware` (alias `office`),
`StaffMiddleware` (alias `staff`), and `DenyRoleMiddleware` (alias `deny_role`).
There is **no blanket PB/Admin bypass** of confidential areas.

| Area | Who |
|---|---|
| VAWC case content | office `VAWC` only (access logged; confidential fields encrypted) |
| Health records | office `Health Station` only |
| Lupon records | office `Lupon` + role `Punong Barangay` |
| Resident registry (add/edit) | **Population Office + Admin only** |
| Certificates | Main Office staff; **the Clerk handles certificates only** |
| Certificate approval | role `Punong Barangay` only |
| SK / landing content (news, home pictures, officials) | `SK` + PB + Admin |
| Resident portal | role `Resident` (scoped to own `resident_id`) |

Resident portal accounts are created **only by the Population Office**
(`POST /api/population/residents/{id}/create-account`). The public
`auth/register` route is intentionally removed.

## Endpoint map

All routes are under `/api`. Auth via `Authorization: Bearer <token>`.
Responses use `{ success, message, data }`.

**Public (no auth):** `POST auth/login`, `GET services`, `GET contact`,
`GET announcements`, `GET hero-slides`, `GET officials`,
`GET verify/{referenceNumber}`, `POST assistant/inquiry`.

**Account (any auth):** `GET auth/me`, `POST auth/logout`, `PUT auth/profile`,
`POST auth/change-password`; notifications (`GET notifications`,
`POST notifications/read-all`, `POST notifications/{id}/read`).

**Resident portal** (`office:ResidentRole`, under `portal/`): `dashboard`,
`requests` (GET/POST), `requests/{id}`, `appointments` (GET/POST),
`appointments/{id}/cancel`, `certificates`, `profile`.

**Staff (`staff`):**
- Dashboards: `dashboard/summary`, `dashboard/pending-items`, `reports/service-statistics`
- Residents: `apiResource residents` (writes = Population/Admin), `residents/search`,
  `residents/household-options`, `residents/{id}/sectors`, `population/verify-resident`
- Certificates (the Clerk's area): `certificates/fee-schedule`,
  `apiResource certificates` (index/store/show), `approve` (PB) / `release` / `reprint`
- **Blocked to the Clerk (`deny_role:Clerk`):** administrative-records,
  `apiResource service-requests` + `/status`, `apiResource appointments` +
  confirm/cancel, and `manage/service-guides`
- **SK** (`office:SK,PB,AdminRole`, under `sk/`): `apiResource hero-slides`,
  `apiResource officials`, `apiResource announcements` (all with image upload)
- **VAWC** (`office:VAWC`, under `vawc/`): cases CRUD, incidents, referrals,
  followup, documents, access-logs, reports/statistics
- **Lupon** (`office:Lupon,PB`, under `lupon/`): cases, screen-jurisdiction,
  hearings, mediation, conciliation, settlement, settlement-action, deadlines,
  forms, reports/monthly-transmittal
- **Population** (`office:Population,AdminRole`, under `population/`): households,
  events (+verify), sectors, analytics, sectoral report,
  `residents/{id}/create-account`, accounts, accounts/{id}/toggle
- **Health** (`office:Health Station`, under `health/`): visits, patient history,
  immunization, maternal-health, child-health, immunization-status, reports/coverage
- **Admin** (`office:AdminRole`, under `admin/`): `users` (list/create/update)

## Notes

- **Image uploads** (home pictures, official photos, news photos) accept
  JPG/PNG up to 5 MB. Updates that replace an image use POST with a spoofed
  `_method=PUT` field (PHP cannot parse multipart bodies on a real PUT).
- The public landing page (`/`) reads `hero-slides`, `announcements`, and
  `officials`; if those are empty it falls back to bundled default content.
- AI-assisted inquiry (`POST assistant/inquiry`) is a rule-based search over
  the `service_guides` table; an LLM can be integrated in
  `PublicController::assistantInquiry` without changing the API contract.
- Notifications are in-system only (SMS/email channels are modeled but not wired).
