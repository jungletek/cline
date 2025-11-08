@echo off
setlocal enabledelayedexpansion

echo Building CLI for Windows...

REM Skip protobuf generation for now if files don't exist
REM npm run protos
REM npm run protos-go

REM Create output directory
if not exist "dist-standalone\extension" mkdir dist-standalone\extension
copy package.json dist-standalone\extension\

REM Extract version information for ldflags
for /f "delims=" %%i in ('node -p "require(''./package.json'').version"') do set CORE_VERSION=%%i
for /f "delims=" %%i in ('node -p "require(''./cli/package.json'').version"') do set CLI_VERSION=%%i
for /f "delims=" %%i in ('git rev-parse --short HEAD 2^>nul ^|^| echo unknown') do set COMMIT=%%i
for /f "delims=" %%i in ('powershell -command "Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ'"') do set DATE=%%i
set "BUILT_BY=%USERNAME%"
if "%BUILT_BY%"=="" set "BUILT_BY=unknown"

REM Build ldflags to inject version info
set "LDFLAGS=-X 'github.com/cline/cli/pkg/cli/global.Version=%CORE_VERSION%' -X 'github.com/cline/cli/pkg/cli/global.CliVersion=%CLI_VERSION%' -X 'github.com/cline/cli/pkg/cli/global.Commit=%COMMIT%' -X 'github.com/cline/cli/pkg/cli/global.Date=%DATE%' -X 'github.com/cline/cli/pkg/cli/global.BuiltBy=%BUILT_BY%'"

cd cli

REM Detect current platform (Windows)
set "OS=windows"
set "ARCH=amd64"

REM Check architecture
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    set "ARCH=amd64"
) else if "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
    set "ARCH=arm64"
)

echo Building for current platform (%OS%-%ARCH%)...

REM Build binaries
set GO111MODULE=on
go build -ldflags "%LDFLAGS%" -o bin\cline.exe .\cmd\cline
if %errorlevel% neq 0 (
    echo ERROR: Failed to build cline
    exit /b 1
)
echo   ✓ bin\cline.exe built

go build -ldflags "%LDFLAGS%" -o bin\cline-host.exe .\cmd\cline-host
if %errorlevel% neq 0 (
    echo ERROR: Failed to build cline-host
    exit /b 1
)
echo   ✓ bin\cline-host.exe built

echo.
echo Build complete for current platform!

REM Copy binaries to dist-standalone/bin
cd ..
if not exist "dist-standalone\bin" mkdir dist-standalone\bin
copy cli\bin\cline.exe dist-standalone\bin\cline.exe
copy cli\bin\cline.exe dist-standalone\bin\cline-%OS%-%ARCH%.exe
copy cli\bin\cline-host.exe dist-standalone\bin\cline-host.exe
copy cli\bin\cline-host.exe dist-standalone\bin\cline-host-%OS%-%ARCH%.exe
echo Copied binaries to dist-standalone\bin\ (both generic and platform-specific names)

echo.
echo CLI build completed successfully!
