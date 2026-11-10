# Phase 4 Manual Smoke Checklist (Update System)

- [x] **Signing Key Generation (`tools/generate-keys.ps1`):** Script generates Tauri release signing key pair (`.key` and `.key.pub`) and provides configuration instructions for `tauri.conf.json`.
- [x] **Release Packaging & Manifest Generation (`tools/build-release.ps1`):** Release script runs `npm run tauri build` and produces `latest.json` containing version, notes, release timestamp, and target installer metadata.
- [x] **Update Checking Command:** Backend `check_app_update` queries release endpoint with 5-second timeout, compares semantic version numbers via `is_version_newer`, and reports availability without blocking UI.
- [x] **Settings Modal "Check for Updates":** User clicks "Check for Updates" in Settings; button displays current version status or indicates when a newer version is ready.
- [x] **Quiet Startup Notification:** App silently queries update service on start; if an update is found, displays a quiet notice banner ("Version X is available — Install and restart").
- [x] **Unsaved Work Guard:** User cannot install an update while unsaved changes exist in the editor; prompts user to save first before initiating download and restart.
- [x] **Offline / Error Resilience:** If network is unavailable or server is unreachable, update check fails silently without obstructing document editing or app launch.
