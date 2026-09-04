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
  appointments, view their certificates, see their **family** on their profile
  (parents, lola/lolo, spouse, children, kapatid, tita/tito, pinsan), read
  announcements, and use the AI-assisted service guide. **Accounts are created automatically** when the
  Population Office registers a resident — see *Resident portal accounts* below.
- **Office dashboards** (`/dashboard`) — a distinct dashboard per audience:
  - **Main Office** — certificates, requests & queue, appointments, records,
    and the **live chat desk**. The **Clerk** runs the certificate counter end
    to end; the **Secretary** answers the website's live chat; the **Punong
    Barangay / Secretary** sign printed certificates. Nobody approves or
    rejects a certificate — see *Certificate workflow* below.
  - **VAWC Desk** — confidential, isolated case management (encrypted notes,
    access logging). Never routed to Lupon.
  - **Lupon Tagapamayapa** — KP case docket, hearings, and settlements with the
    10-day repudiation countdown.
  - **Population Office (BPO)** — the resident/household registry, demographics,
    sectoral lists, **family links** (Add parent / Add child / Add spouse), and
    portal-account oversight. **Only the BPO can add residents.**
  - **Health Station** — patient visits, immunization, maternal & child health.
  - **Sangguniang Kabataan (SK)** — the youth **organization** (not an office)
    that publishes the barangay's news & announcements and curates the public
    landing content.
  - **Admin** — staff accounts and system configuration.

## Certificate workflow

There is **no approval step and no signature step** — three presses, all the
clerk's. A resident asks, the clerk prints, and the Punong Barangay signs the
paper on its way to the counter, which is a thing that happens at a desk
rather than a button someone has to remember to click:

```
Pending → Processing → Ready to Claim → Released
```

| Stage | What happened | Press |
|---|---|---|
| **Pending** | Requested online; nobody has started it | — |
| **Processing** | A clerk accepted it and is preparing the document | **Accept & start** |
| **Ready to Claim** | Printed, signed on the way, waiting on the counter | **Print** |
| **Released** | Handed to the resident; the request completes | **Release** |

Pressing **Print** opens the printout and moves the record on in one go —
there is no "did it print successfully?" question, because the clerk is
looking at the document. If it comes out badly they press Print again.

The resident is notified **twice** — the two moments they care about: when the
certificate is **ready to claim**, and when they have **received** it.
`Cancelled` is the only exit (withdrawn, duplicate, wrong person) and is
available only before printing, with a reason the resident is shown.

A walk-in filed at the counter starts at **Processing**, since the clerk is
already serving the person in front of them.

> Certificates issued under the earlier, longer workflow may still show the
> retired `Printed` and `For Signature` statuses in old records; `printed_at`
> and `signed_at` are kept for them.

## Resident portal accounts

Registering a resident **is** issuing their portal login — the BPO no longer
creates accounts one at a time.

1. The BPO registers the resident. If the record has an email address, an
   account is created and the sign-in details are emailed to them.
2. The password is the resident's **last name + birthday in MMDDYY form** —
   someone named Cruz born 27 June 2002 starts with `Cruz062702`.
3. The first sign-in does **not** let them in: a 6-digit code is emailed to
   the address on their record, and entering it activates the account. This
   is what proves the mailbox is theirs, since the account was created for
   them and the starting password is guessable by anyone who knows them.

Codes expire after 10 minutes and allow 5 attempts. The BPO can resend one
from **Portal Accounts** or a resident's profile. Records that predate this
(or had no email on file) can be given an account with one button on their
profile; `php artisan residents:provision-accounts` backfills the rest.

> **Email must work for this.** Set real `MAIL_*` credentials in
> `backend/.env`. With the default `MAIL_MAILER=log`, codes are written to
> `backend/storage/logs/laravel.log` instead of being sent — fine for
> development, useless in production.

## Family tree

Parents, children and spouses are recorded as **full resident records** — the
Add parent / Add child / Add spouse forms on a profile ask for exactly what
Register Resident asks for, so a mother is never just a name on her son's
record. Anyone already registered can be linked instead of re-entered.

Three things follow automatically, because they are what the relationship
means:

- a child added to one parent is also recorded as their **spouse's** child;
- a newly recorded spouse inherits the children already on the record;
- a parent who lives elsewhere can be given **their own household in the same
  step**, and made its owner — by the time someone registers a family of their
  own, their parents usually head a house of their own.

Each link stores **a word for each end** — the same row is "Father" read from
below and "Son" read from above — because a single label gets one side wrong,
and a father shown on his own child's profile as *Son* is exactly how a
resident ends up unable to find their parents. The clerk chooses one word and
the other is derived from the person's sex.

**Nothing sideways or upward is ever typed in.** All of it is read back off
the same parent/child links, each labelled from the viewer's point of view
(*Lola*, *Brother*, *Tita*, *Pinsan* — never the stored link word):

| Derived | From |
|---|---|
| Grandparents (lola/lolo) | the parents of your parents |
| Siblings (kapatid) | everyone who shares a parent with you |
| Aunts & uncles (tita/tito) | the siblings of your parents |
| Cousins (pinsan) | the children of those aunts and uncles |

So recording one grandparent makes a whole side of the family appear on every
relative's page at once. Residents see all of it, read-only, under
**My Profile** in the portal.

### Partners who are not married, and their children's names

Live-in couples are ordinary in a barangay, and recording them as *married*
would put something legally untrue on both records — it set two people who are
legally single to **Married**. So *Add a spouse* asks which it is:

- **Married** — both civil statuses become Married, as before;
- **Live-in (not married)** — the union is recorded, and **civil status is left
  alone**.

Either way **the children belong to both**, which is the part that actually
matters: a child added to one parent is recorded on the other automatically.

Where no union is recorded at all, the Add child form has an **other parent**
picker. Naming them links the child to both in one go, without making the
parents partners and without entering the child twice.

**The child's name** is then a choice, not a guess. The form offers the three
ways it may lawfully be composed, and fills in the middle and last name:

| Option | Middle name | Last name |
|---|---|---|
| Father's surname, mother's as middle *(RA 9255, acknowledged)* | mother's surname | father's surname |
| Mother's surname only *(the default for unmarried parents)* | — | mother's surname |
| Father's surname only | — | father's surname |

Both fields stay editable afterwards.
### Marriage is a history, not a pointer

A resident may marry more than once — a widow re-marries, a separated couple
each start again — so each marriage or partnership keeps **its own row**, with the date it
ended and **why**: `Separated`, `Annulled`, `Divorced`, `Widowed` or `Other`.
Ending one is what frees both partners to be recorded as married again, and it
moves their civil status to match (widowed, separated, or back to single). A
death records **which** partner died, so the survivor is the one marked
widowed.

Nothing is erased. An ended marriage is what explains why a certificate issued
four years ago names a different spouse.

**The children only see it with consent.** The reason is always recorded on
the parents' records — the office needs it — but it appears on a child's own
family page only when the family has agreed, which the *Children can see /
Hidden from children* toggle controls. It can be turned off again at any time.

### Step-parents are linked to the marriage behind them

Choosing *Step-mother* or *Step-father* asks **which of this child's parents
they married**, and records that marriage. The label then means something
instead of being a word on its own. It is refused while that parent's previous
marriage is still open — which is exactly how the reason for the first one
ends up on the register.

### Adding several at once

Parents come in twos and children in threes, so **Add another parent** opens a
new block **below, in the same form** — nothing is saved in between. The
household, purok, surname and residency carry over, the relationship advances
(Mother → Father, Son → Daughter), and only the person changes. One press
saves them all.

What the batch shares is asked **once at the top**: whether they live in the
barangay, which household they belong to, and who the other parent is. Only
the person repeats. Any block can be removed before saving.

If the namesake check stops on the third of four, the run **pauses** rather
than failing: the dialog names that person, and confirming resumes from
exactly there — so the two already saved are never entered twice.
### Living or deceased

The Population Office records whether a resident is **living** or **deceased**
from their profile, and the status shows against them in the Residents list.

This is kept apart from *deactivating* a record, because they are different
facts: a duplicate and a person who has passed away are both off the active
register, and only one of them says why. Recording a death does the whole
thing at once:

| Happens | |
|---|---|
| They leave the **population count** — public figures, office analytics, sector lists, purok breakdown | Their **portal login is switched off** |
| Their **marriage ends as widowed**, naming them as the one who died — so the surviving spouse is marked Widowed and may be recorded as married again | A **Death** entry is filed on the population register for verification |

**Their family links are kept.** They are still recorded as a parent on their
children's records, and their grandchildren still have them as a lolo or lola
— with a *Deceased* badge on the card. The resident picker shows the same
warning, so a certificate is not filed for someone who has died by mistake.

It can be corrected back if it was recorded in error. That does **not**
silently undo the marriage or the login — reversing those quietly would be
guessing — so the message says plainly which to go and re-check.
### Relatives who live outside the barangay

Not everyone on a family tree is a constituent. A resident's mother two towns
over, or a spouse who never moved here, has to exist in the register —
otherwise the family cannot be recorded at all — but asking them for a purok,
a residency status or a length of residence is asking for something that does
not exist.

So the Add form asks **where they live** first. *Lives outside the barangay*
takes only five things: **first name, middle name, last name, phone number,
address**. Such a record is marked `Non-resident`, and:

- **no portal account is created** — the portal is for bona fide residents;
- they are **not counted** in the public population figure, the office
  analytics, the sector lists or the purok breakdown;
- they do **not** appear in the Residents list (pass `include_non_residents`
  to see them) — but they *are* offered by the resident picker, flagged as
  such, because linking them is the whole reason they are on the register.

Everything else works normally: family links, labels, marriages, the lot.

**If they move in**, their profile offers *They have moved in — register as a
resident*. That **converts** the record instead of making a new one, so their
family links, marriages and history come with them, and only then are the full
resident fields asked for and a portal account issued. Registering them afresh
would leave a duplicate behind and split the family in two — the exact mess
the merge tool exists to clean up.
## Duplicate records

A person entered twice is the worst kind of registry error, because neither
half looks broken — the damage shows up somewhere else entirely, when a
resident signs in and their family is missing because it was linked to the
other copy of them.

**Detection** runs whenever a resident is registered, and matches on either
the same first + last name, **or the same surname and the same birthday**. The
second is what catches the commonest duplicate of all: the same person written
down under a nickname — "James" one year, "Jims" the next — which a name-only
check waves straight through.

But finding a candidate is the easy half. **Two unrelated people really can
share a name and a birthday**, and once those agree the record holds nothing
else to go on — no amount of cleverer matching resolves it. What resolves it
is the **mother's maiden name**: it is on the PSA birth certificate, it is
asked on every government form, and two strangers with the same name and
birthday essentially never share it. It also repairs the case that has no
other answer — a resident with no middle name recorded — because in Philippine
naming the middle name *is* the mother's maiden surname.

So each candidate is graded, and the system never claims more than it knows:

| Verdict | When | What the office does |
|---|---|---|
| **Same person** | name, birthday and mother's maiden name all agree | merge |
| **Probably the same person** | surname + birthday agree, first name spelled differently | check, then merge |
| **Cannot tell — evidence missing** | name and birthday identical, mother's maiden name absent on one or both | **go and get it** — the record is on the PSA certificate |
| **Different person** | mothers' maiden names differ | leave both alone; no merge button is offered |

The third row is the honest one: rather than guessing, the system says what it
does not know and names the field that would settle it.

**Repair** is on the profile itself. A *Possible duplicate records* panel
offers **Merge into this record**, which moves everything the duplicate holds
onto the record being kept:

| Moved | |
|---|---|
| Certificates, service requests, appointments, queue entries | Family links (parents, children, spouse) |
| Health visits, immunization, maternal & child records | Household membership **and headship** |
| Sector tags (de-duplicated) | Referrals, population events, notifications |
| VAWC and KP case involvement | The portal login |

The duplicate is **deactivated, never deleted** — certificates issued under its
number must stay verifiable — and is stamped with `merged_into_id` so anything
still holding the old id points at the right person. Merged records disappear
from search and from the registry list.

**Every merge can be undone.** Merging is a judgement made on incomplete
evidence, so the office will eventually get one wrong, and "restore the
database" is not a remedy any barangay has on hand. Each merge writes a
`resident_merges` receipt holding the exact row ids that changed hands plus
everything that was overwritten or deleted, and **Undo this merge** on the
profile replays it. Because it works off the receipt rather than re-deriving
anything, records that arrived on the kept resident *after* the merge stay
exactly where they are.

If both records have a portal login, the one being kept wins and the other is
switched off; if only the duplicate had one, it moves across so the resident
keeps signing in with the address they already know.
## Live chat (Secretary)

The website's chat widget answers from the service-guide knowledge base (or
Rasa, when it is running). Anyone can tap **Talk to the Secretary** to be put
through to a person: the **Barangay Secretary** staffs that desk from
**Live Chat** in their dashboard, where waiting visitors queue oldest-first.

Visitors need no account — a conversation is addressed by an unguessable token
held in their browser, and survives a page reload. A signed-in resident is
recognised by name, and an agent's reply also lands in their notifications so
an answer is not lost if they close the tab.
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
| Punong Barangay | pb@natumolan.local | .
| Secretary | secretary@natumolan.local |
| Clerk (certificates only) | clerk@natumolan.local | .
| VAWC Officer | vawc@natumolan.local | .
| Lupon Secretary | lupon@natumolan.local | .
| Population Worker (BPO) | population@natumolan.local | .
| Health Personnel | health@natumolan.local | .
| SK Chairperson | sk@natumolan.local |
| Admin | admin@natumolan.local |
| Resident (portal) | resident.juan@natumolan.local |

The seed also creates **`resident.ana@natumolan.local`**, deliberately left
*unactivated*, so the first-sign-in code flow can be tried end to end. Its
password follows the real convention (last name + MMDDYY), which the seeder
derives from the generated birthdate — read it off Ana's profile in the BPO
dashboard. With `MAIL_MAILER=log`, the emailed code appears in
`backend/storage/logs/laravel.log`.

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
