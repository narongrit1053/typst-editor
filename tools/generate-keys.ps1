<#
.SYNOPSIS
  Generates a Tauri release signing key pair for Typst-Editor by Kong.
.DESCRIPTION
  Phase 4 update signing. Produces:
  - Private key: src-tauri/.tauri/typst-editor.key (KEEP PRIVATE! DO NOT COMMIT!)
  - Public key: src-tauri/.tauri/typst-editor.key.pub (placed into tauri.conf.json updater config)
#>

$KeyDir = Join-Path $PSScriptRoot "..\src-tauri\.tauri"
if (-not (Test-Path $KeyDir)) {
    New-Item -ItemType Directory -Path $KeyDir | Out-Null
}

$KeyPath = Join-Path $KeyDir "typst-editor.key"
Write-Host "Generating Tauri updater signing keys..." -ForegroundColor Cyan

if (Test-Path $KeyPath) {
    Write-Host "Keys already exist at: $KeyPath" -ForegroundColor Yellow
} else {
    npx @tauri-apps/cli signer generate -w $KeyPath
}

$PubPath = "$KeyPath.pub"
if (Test-Path $PubPath) {
    $PubKey = Get-Content $PubPath -Raw
    Write-Host "`nPublic key (place in tauri.conf.json -> plugins.updater.pubkey):" -ForegroundColor Green
    Write-Host $PubKey.Trim() -ForegroundColor White
}
