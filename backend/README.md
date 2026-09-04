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
| Portal accounts | bona fide residents only — never `Non-resident` records |
| Certificates | Main Office staff; the **Clerk runs the whole counter** |
| Certificate signing | not recorded at all — a wet signature on paper, never a click |
| Live chat desk | role `Secretary` (+ PB/Admin); the Clerk is excluded |
| Family links (add/link/unlink) | **Population Office + Admin only** |
| Marriage history & its child-visibility consent | **Population Office + Admin only** |
| SK / landing content (news, home pictures, officials) | `SK` + PB + Admin |
| Resident portal | role `Resident` (scoped to own `resident_id`) |

Resident portal accounts are created **automatically when a resident is
registered** (`App\Support\PortalAccount::provision`). The account starts
inert: `activated_at` is null until the resident enters a 6-digit code emailed
to the address on their record, and no API token is issued before that. The
password is the resident's last name + birthday as MMDDYY (`Cruz062702`).
`POST /api/population/residents/{id}/create-account` remains for records that
predate this or had no email on file, and
`php artisan residents:provision-accounts` backfills in bulk. The public
`auth/register` route is intentionally removed.

### Certificate workflow

`Pending → Processing → Ready to Claim → Released`, plus `Cancelled` as the
only exit (before printing, with a reason). No approve/reject and no
signature step: three endpoints — `accept`, `mark-printed`, `release` — and
each moves the DOCUMENT. `mark-printed` is the whole middle of the workflow;
it stamps `printed_at` and `ready_at`, issues the QR, and notifies the
resident. Public verification (`GET verify/{ref}`) succeeds from that moment.
`Printed` and `For Signature` are retired statuses kept only on historical
rows.

## Endpoint map

All routes are under `/api`. Auth via `Authorization: Bearer <token>`.
Responses use `{ success, message, data }`.

**Public (no auth):** `POST auth/login`, `POST auth/activate`,
`POST auth/resend-activation`, `GET services`, `GET contact`,
`GET announcements`, `GET hero-slides`, `GET officials`,
`GET verify/{referenceNumber}`, `POST assistant/inquiry`, and live chat:
`POST chat/start`, `GET chat/{token}`, `POST chat/{token}/messages`,
`POST chat/{token}/end` (the 48-character token is the visitor's only
credential; the route is pinned to that pattern so it cannot shadow the
staff-side `chat/conversations`).

**Account (any auth):** `GET auth/me`, `POST auth/logout`, `PUT auth/profile`,
`POST auth/change-password`; notifications (`GET notifications`,
`POST notifications/read-all`, `POST notifications/{id}/read`).

**Resident portal** (`office:ResidentRole`, under `portal/`): `dashboard`,
`requests` (GET/POST), `requests/{id}`, `appointments` (GET/POST),
`appointments/{id}/cancel`, `certificates`, `profile`, `family` (parents,
grandparents, spouse, children, siblings, aunts_uncles, cousins — the last
four derived, never stored).

**Staff (`staff`):**
- Dashboards: `dashboard/summary`, `dashboard/pending-items`, `reports/service-statistics`
- Residents: `apiResource residents` (writes = Population/Admin), `residents/search`,
  `residents/household-options`, `residents/{id}/sectors`, `population/verify-resident`
- Family (Population/Admin): `GET residents/{id}/family`,
  `POST residents/{id}/family/{parent|child|spouse}` (registers a new resident
  and links them; accepts `household_id` + `make_household_head` so a parent
  who lives elsewhere can head their own house in the same step),
  `POST residents/{id}/family/link` (links an existing one),
  `DELETE residents/{id}/family/{relative}?relation=…`. `family/parent`
  also accepts `married_to_parent_id`, which marries the new step-parent to an
  existing parent (refused while that parent's own marriage is still open)
- Life status (Population/Admin): `POST residents/{id}/life-status` with
  `life_status` (Alive|Deceased), optional `date_of_death` and `note`. A death
  clears `is_active` (which every population count already filters on),
  disables the portal login, ends an open marriage as Widowed naming the
  deceased, and files a Death population event — all in one transaction.
  Family links are deliberately untouched
- Non-residents: pass `record_type=Non-resident` to `family/{relation}` and
  only name / phone / address are asked for — no portal account, excluded
  from every population count and from `residents` (unless
  `include_non_residents`), still offered by `residents/search`.
  `POST residents/{id}/convert-to-resident` promotes one to a full resident,
  keeping their id and every link attached to it
- Unions: `family/spouse` and `family/link` accept `union_type`
  (`Married` | `Live-in`). A live-in union links the pair and their children
  but leaves both civil statuses alone. `family/child` accepts
  `other_parent_id`, which records the child on both parents when no union
  exists between them
- Marriages (Population/Admin): `GET residents/{id}/marriages` — every
  marriage or partnership, current and ended; `POST residents/{id}/marriages/{m}/end` with
  `end_reason` (Separated/Annulled/Divorced/Widowed/Other), optional
  `ended_on`, `end_notes`, `deceased_id` (required for Widowed, so the
  SURVIVOR is the one marked widowed) and `shown_to_children`;
  `POST residents/{id}/marriages/{m}/visibility` toggles that consent later.
  `residents.spouse_id` stays as the fast "who now?" pointer, kept in step
  with whichever row is open
- Duplicates (Population/Admin): `GET residents/{id}/duplicates` — candidates
  graded `confirmed` / `likely` / `unknown` / `different_person` from the
  MOTHER'S MAIDEN NAME (the only field that separates two people who share a
  name and a birthday), each with a plain-language `verdict` and a
  field-by-field `differences` list; `POST residents/{id}/merge` with
  `duplicate_id` moves every reference onto the kept record and deactivates
  the other. Reversible: `GET residents/{id}/merges` lists the receipts and
  `POST residents/{id}/merges/{merge}/undo` replays one backwards (see
  `App\Support\ResidentMerge` and the `resident_merges` table)
- Certificates (the Clerk's counter): `certificates/fee-schedule`,
  `certificates/requirements`, `apiResource certificates`
  (index/store/show/update), then `accept` → `mark-printed` →
  `send-for-signature` → `mark-signed` → `release`, plus `cancel` and `reprint`
- Live chat desk (`office:Main Office,PB,AdminRole` + `deny_role:Clerk`, under
  `chat/`): `queue/count`, `conversations`, `conversations/{id}`,
  `conversations/{id}/claim`, `/reply`, `/close`
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
  `residents/{id}/create-account` (repair only), accounts,
  accounts/{id}/toggle, accounts/{id}/resend-activation
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
- Notifications are in-system only (SMS channels are modeled but not wired).
  **Email is wired** and is required: activation codes and the welcome message
  go out through the `MAIL_*` mailer. With `MAIL_MAILER=log` they land in
  `storage/logs/laravel.log` instead of being delivered. Mail failures are
  logged, never raised — a mail outage must not lose a registration.

## Email (Gmail SMTP)

A resident cannot use the portal until they enter a code that arrives by
email, so mail working is not a nice-to-have. And because mail failures are
deliberately swallowed — an outage must not look to a resident like a wrong
password — a broken mailbox is **invisible from the app**: the clerk is told
the code went out, the resident waits for one that never arrives, and the only
trace is a line in `storage/logs/laravel.log`.

So verify it directly, never by "trying a registration":

```
php artisan mail:test you@example.com
```

It prints the settings in use, refuses on the ones that are obviously wrong,
sends a real message through the real template, and — when the server rejects
it — says which of the handful of known causes it was.

### Settings

Fill these three in `.env`; the rest are already correct for Gmail:

```
MAIL_USERNAME=barangay.natumolan@gmail.com
MAIL_PASSWORD=abcdefghijklmnop          # 16-character app password
MAIL_FROM_ADDRESS=barangay.natumolan@gmail.com
```

- `MAIL_PASSWORD` is an **app password**, never the Google account password.
  App passwords only exist once 2-Step Verification is on:
  *myaccount.google.com → Security → 2-Step Verification → App passwords*.
  Paste the 16 characters without the spaces Google displays.
- `MAIL_FROM_ADDRESS` must be the **same mailbox** as `MAIL_USERNAME`. Gmail
  will not send as an address it does not own.
- Port 587 with STARTTLS, so `MAIL_SCHEME` stays empty. Only set it to `smtps`
  if you move to port 465.
- Gmail's free tier allows roughly 500 messages a day, which a barangay
  register will not approach.

### The certificate trap on this machine

Mail is sent **synchronously**, so a send that hangs holds up the request that
triggered it. That is fine — until TLS fails, which on this laptop it did:

```
error:0A000086:SSL routines::certificate verify failed
```

This was **not** the password and **not** an out-of-date CA bundle. AVG's Mail
Shield intercepts outgoing SMTP and presents its own certificate:

```
subject: smtp.gmail.com  |  issuer: AVG Web/Mail Shield Root
```

No public CA list can validate that, because it is not Google's certificate.
Windows trusts the AVG root already — which is why browsers never complain —
so PHP was pointed at a bundle that includes it:

- `C:\xampp\php\extras\ssl\cacert.pem` — the current curl bundle plus the
  AVG Web/Mail Shield root.
- `C:\xampp\php\php.ini` — `curl.cainfo` and `openssl.cafile` both point
  there (XAMPP shipped a 2022 bundle at `apache\bin\curl-ca-bundle.crt`).
- Apache must be restarted for the web server to pick this up; the CLI reads
  `php.ini` fresh each run.

**This is a workaround for one development machine.** A server without AVG
needs none of it — just the current bundle from <https://curl.se/ca/cacert.pem>.
Turning off AVG's outbound-SMTP scanning is the other way out, and restores the
real Google certificate.
- Live chat is polled over REST, not a websocket: a socket server nobody
  restarts after a power cut is worse for a barangay office than a request
  every few seconds.
