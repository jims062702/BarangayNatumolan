# Starts the Barangay Natumolan Rasa assistant (train if needed, then serve).
# Usage:  powershell -ExecutionPolicy Bypass -File start-rasa.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# 1) License key — paste your Rasa Developer Edition key into rasa\license.txt
#    (one line), or set the RASA_LICENSE environment variable yourself.
if (Test-Path "$PSScriptRoot\license.txt") {
  $key = (Get-Content "$PSScriptRoot\license.txt" -TotalCount 1).Trim()
  $env:RASA_LICENSE = $key
  $env:RASA_PRO_LICENSE = $key   # older name, kept for compatibility
}
if (-not $env:RASA_LICENSE) {
  Write-Host "No license key found." -ForegroundColor Red
  Write-Host "Paste your Rasa Developer Edition license key into: rasa\license.txt"
  exit 1
}

$rasa = "$PSScriptRoot\.venv\Scripts\rasa.exe"
if (-not (Test-Path $rasa)) {
  Write-Host "Rasa is not installed yet. Run these once:" -ForegroundColor Red
  Write-Host "  py -3.11 -m venv .venv"
  Write-Host "  .venv\Scripts\pip install rasa-pro"
  exit 1
}

# 2) Train (Rasa skips training automatically when nothing changed).
& $rasa train

# 3) Serve on port 5005 with CORS open so the website widget can call it.
& $rasa run --enable-api --cors "*" --port 5005
