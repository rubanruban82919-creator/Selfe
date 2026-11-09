# RetinaGuard AI PowerShell Launcher
$ErrorActionPreference = "Stop"
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   RetinaGuard AI - Ophthalmic Decision Support" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$venvPython = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
if (Test-Path $venvPython) {
    & $venvPython (Join-Path $PSScriptRoot "app.py")
} else {
    python (Join-Path $PSScriptRoot "app.py")
}
