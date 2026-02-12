# scripts/autopush.ps1
# Auto-commit + push if there are changes.
# Commit message includes timestamp + optional note from autopush_note.txt

$ErrorActionPreference = "SilentlyContinue"

# Go to repo root (assumes script is in scripts/)
Set-Location (Resolve-Path "$PSScriptRoot\..")

# Only run if this is a git repo
git rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) { exit 0 }

# Check for changes
$changes = git status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) { exit 0 }

# Optional note
$noteFile = "autopush_note.txt"
$note = ""
if (Test-Path $noteFile) {
  $note = (Get-Content $noteFile -Raw).Trim()
}

$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$msg = if ($note) { "wip: $ts - $note" } else { "wip: $ts" }

git add -A | Out-Null
git commit -m "$msg" | Out-Null

# Push
git push | Out-Null