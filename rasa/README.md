# Barangay Natumolan — Rasa AI Assistant

The website's floating chat icon (bottom-right) talks to this Rasa assistant.
It answers questions about certificates, fees, requirements, office hours,
appointments, the resident portal, VAWC, Lupon, and health services — in
English and Filipino.

**Fallback built in:** when this Rasa server is NOT running, the widget
automatically answers using the system's built-in service-guide assistant,
so the chat icon always works. Start Rasa and the widget upgrades to the AI
assistant automatically — no frontend changes needed.

## One-time setup

Python 3.11 and the `rasa/.venv` virtual environment are already prepared.
If you ever need to redo it:

```powershell
cd "c:\xampp\htdocs\Barangay Natumolan\rasa"
py -3.11 -m venv .venv          # Rasa needs Python 3.10–3.12 (not 3.13)
.venv\Scripts\pip install rasa-pro
```

## Add your license key

Create a file named `license.txt` in this folder containing ONLY your
**Rasa Developer Edition license key** (one line). Keep it private — do not
commit or share it. The start script loads it into the `RASA_LICENSE`
environment variable (the name rasa-pro 3.18 expects).

## Train + run

```powershell
cd "c:\xampp\htdocs\Barangay Natumolan\rasa"
powershell -ExecutionPolicy Bypass -File start-rasa.ps1
```

The script loads your license, trains the model (only when the data
changed), and serves the bot at **http://localhost:5005** with CORS open
for the website. Leave the window running; the chat icon now uses Rasa.

Quick test without the website:

```powershell
curl -X POST http://localhost:5005/webhooks/rest/webhook `
  -H "Content-Type: application/json" `
  -d '{"sender":"test","message":"How much is a barangay clearance?"}'
```

## Changing what the bot knows

| What | Where |
|---|---|
| Answers (fees, hours, contact…) | `domain.yml` → `responses:` |
| Understanding (example questions) | `data/nlu.yml` |
| Which question triggers which answer | `data/rules.yml` |

After editing, run `start-rasa.ps1` again — it retrains automatically.
Keep the fee amounts in `utter_certificates`/`utter_fees` in sync with
`backend/app/Http/Controllers/Api/CertificateController.php` (`FEES`).

## Pointing the widget elsewhere

The widget defaults to `http://localhost:5005`. For production, set
`VITE_RASA_URL=https://your-rasa-host` in `frontend/.env` and rebuild.
