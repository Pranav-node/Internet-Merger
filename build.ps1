<#
.SYNOPSIS
    Builds and packages Internet Merger into a standalone Windows zip distribution.

.DESCRIPTION
    1. Validates Node.js and Python environments.
    2. Builds production frontend bundle with Vite.
    3. Runs PyInstaller in onedir mode with Uvicorn hidden imports.
    4. Bundles frontend assets and documentation.
    5. Produces InternetMerger-windows.zip and its SHA-256 checksum.
#>

[CmdletBinding()]
param(
    [switch]$SkipFrontendBuild = $false,
    [switch]$NoZip = $false
)

$ErrorActionPreference = "Stop"

Write-Host "===========================================================================" -ForegroundColor Cyan
Write-Host "  INTERNET MERGER - WINDOWS PACKAGING & RELEASE BUILD SCRIPT" -ForegroundColor Cyan
Write-Host "===========================================================================" -ForegroundColor Cyan

$RootDir = $PSScriptRoot
if (-not $RootDir) { $RootDir = (Get-Location).Path }

$FrontendDir = Join-Path $RootDir "frontend"
$DistDir = Join-Path $RootDir "dist"
$PackageDir = Join-Path $DistDir "InternetMerger"
$ZipFile = Join-Path $RootDir "InternetMerger-windows.zip"
$ChecksumFile = Join-Path $RootDir "checksums.txt"

# 1. Verify Python
Write-Host "`n[1/5] Checking Python environment..." -ForegroundColor Yellow
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCmd) {
    Write-Error "Python was not found in PATH. Please install Python 3.10+."
    exit 1
}
$PythonVersion = python --version
Write-Host "  Using $PythonVersion" -ForegroundColor Green

# 2. Build Frontend
Write-Host "`n[2/5] Building frontend production bundle..." -ForegroundColor Yellow
if ($SkipFrontendBuild) {
    Write-Host "  Skipping frontend build as requested." -ForegroundColor Gray
} else {
    $NpmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $NpmCmd) { $NpmCmd = Get-Command npm -ErrorAction SilentlyContinue }
    if (-not $NpmCmd) {
        Write-Error "'npm' was not found in PATH. Please install Node.js 18+ to build frontend."
        exit 1
    }

    Push-Location $FrontendDir
    try {
        if (-not (Test-Path "node_modules")) {
            Write-Host "  Running npm install..." -ForegroundColor Gray
            & $NpmCmd install
        }
        Write-Host "  Running npm run build..." -ForegroundColor Gray
        & $NpmCmd run build
    } finally {
        Pop-Location
    }

    $FrontendDist = Join-Path $FrontendDir "dist\index.html"
    if (-not (Test-Path $FrontendDist)) {
        Write-Error "Frontend build failed: index.html not found in frontend/dist."
        exit 1
    }
    Write-Host "  Frontend assets compiled successfully." -ForegroundColor Green
}

# 3. Ensure PyInstaller is installed
Write-Host "`n[3/5] Verifying PyInstaller..." -ForegroundColor Yellow
python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Installing PyInstaller..." -ForegroundColor Gray
    python -m pip install pyinstaller
}
Write-Host "  PyInstaller is ready." -ForegroundColor Green

# 4. Run PyInstaller (onedir mode, no admin rights)
Write-Host "`n[4/5] Compiling standalone Windows executable with PyInstaller..." -ForegroundColor Yellow
Push-Location $RootDir
try {
    # Remove previous build cache if exists
    if (Test-Path "build\InternetMerger") {
        Remove-Item -Recurse -Force "build\InternetMerger" -ErrorAction SilentlyContinue
    }

    # Execute PyInstaller build
    pyinstaller --noconfirm --onedir `
        --name InternetMerger `
        --add-data "frontend/dist;frontend/dist" `
        --collect-submodules uvicorn `
        backend/main.py

    if ($LASTEXITCODE -ne 0) {
        Write-Error "PyInstaller compilation failed with code $LASTEXITCODE."
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

# Copy auxiliary documentation and convenience launchers into distribution
if (Test-Path (Join-Path $RootDir "README.md")) {
    Copy-Item (Join-Path $RootDir "README.md") -Destination $PackageDir -Force
}
if (Test-Path (Join-Path $RootDir "LICENSE")) {
    Copy-Item (Join-Path $RootDir "LICENSE") -Destination $PackageDir -Force
}

Write-Host "  PyInstaller onedir package assembled in dist/InternetMerger." -ForegroundColor Green

# 5. Create ZIP Archive and Calculate Checksum
Write-Host "`n[5/5] Creating distribution ZIP and SHA-256 checksum..." -ForegroundColor Yellow
if (-not $NoZip) {
    if (Test-Path $ZipFile) {
        Remove-Item -Force $ZipFile
    }

    Write-Host "  Compressing $PackageDir into $ZipFile ..." -ForegroundColor Gray
    Compress-Archive -Path "$PackageDir\*" -DestinationPath $ZipFile -CompressionLevel Optimal

    $ZipItem = Get-Item $ZipFile
    $ZipSizeMB = [math]::Round($ZipItem.Length / 1MB, 2)
    $FileHash = (Get-FileHash -Path $ZipFile -Algorithm SHA256).Hash.ToLower()

    # Save to checksums.txt
    "$FileHash  InternetMerger-windows.zip" | Out-File -FilePath $ChecksumFile -Encoding utf8 -Force

    Write-Host "`n===========================================================================" -ForegroundColor Green
    Write-Host "  BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "===========================================================================" -ForegroundColor Green
    Write-Host "  Package:       $ZipFile"
    Write-Host "  Archive Size:  $ZipSizeMB MB"
    Write-Host "  SHA-256:       $FileHash"
    Write-Host "  Checksum File: $ChecksumFile"
    Write-Host "===========================================================================" -ForegroundColor Green
} else {
    Write-Host "  Skipping archive creation as requested." -ForegroundColor Gray
}
