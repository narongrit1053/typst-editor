<#
.SYNOPSIS
  Builds a signed release installer and generates latest.json for Typst-Editor by Kong.
.DESCRIPTION
  Phase 4 release pipeline.
#>

param(
    [string]$Version = "0.1.0",
    [string]$Notes = "Release notes for Typst-Editor by Kong",
    [string]$RepoUrl = "https://github.com/kong/typst-editor"
)

$ErrorActionPreference = "Stop"

Write-Host "Building release for Typst-Editor by Kong (v$Version)..." -ForegroundColor Cyan

npm run tauri build

$TargetDir = Join-Path $PSScriptRoot "..\src-tauri\target\release\bundle\nsis"
$Installer = Get-ChildItem -Path $TargetDir -Filter "*.exe" | Select-Object -First 1

if (-not $Installer) {
    Write-Warning "No NSIS installer found in $TargetDir. Check build output."
    exit 1
}

$SigFile = "$($Installer.FullName).sig"
$Sig = ""
if (Test-Path $SigFile) {
    $Sig = (Get-Content $SigFile -Raw).Trim()
}

$DateStr = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$InstallerName = $Installer.Name
$DownloadUrl = "$RepoUrl/releases/download/v$Version/$InstallerName"

$LatestJson = @{
    version = $Version
    notes = $Notes
    pub_date = $DateStr
    platforms = @{
        "windows-x86_64" = @{
            signature = $Sig
            url = $DownloadUrl
        }
    }
} | ConvertTo-Json -Depth 5

$LatestJsonPath = Join-Path $PSScriptRoot "..\src-tauri\target\release\bundle\latest.json"
Set-Content -Path $LatestJsonPath -Value $LatestJson

Write-Host "Successfully generated latest.json at $LatestJsonPath" -ForegroundColor Green
Write-Host $LatestJson -ForegroundColor Gray
