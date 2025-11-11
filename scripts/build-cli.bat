@echo off
setlocal enabledelayedexpansion

REM Change to project root directory (up one level from scripts/)
cd %~dp0..

echo Building CLI for Windows...
echo Checking build prerequisites...

REM Check Node.js (required for scripts)
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found in PATH. Required for build scripts.
    exit /b 1
)

REM Check Go (required for building)
where go >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Go not found in PATH. Required for CLI building.
    exit /b 1
)

REM Check npm dependencies (grpc-tools for protoc, etc.)
if not exist "node_modules" (
    echo ERROR: Dependencies not installed. Run 'npm run install:all' first.
    exit /b 1
)

echo ✓ Prerequisites satisfied
echo Installing Go protobuf tools...

REM Install Go protobuf tools if not already installed
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
if %errorlevel% neq 0 (
    echo ERROR: Failed to install protoc-gen-go
    exit /b 1
)

go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
if %errorlevel% neq 0 (
    echo ERROR: Failed to install protoc-gen-go-grpc
    exit /b 1
)

REM Add Go bin directory to PATH so protoc can find the plugins
for /f "delims=" %%i in ('go env GOBIN 2^>nul') do set "GO_BIN=%%i"
if "%GO_BIN%"=="" for /f "delims=" %%i in ('go env GOPATH') do set "GO_BIN=%%i\bin"
set "PATH=%PATH%;%GO_BIN%"

echo ✓ Go protobuf tools installed and added to PATH

echo Regenerating protobuf files...

REM Use standard npm scripts like cross-platform build
echo Running npm run protos...
call npm run protos
if %errorlevel% neq 0 (
    echo ERROR: Failed to generate TypeScript protobuf files
    exit /b 1
)
REM Ensure output directories exist before npx protoc
if not exist "src\generated" mkdir "src\generated" 2>nul
if not exist "src\generated\grpc-go" mkdir "src\generated\grpc-go" 2>nul  
if not exist "src\generated\grpc-go\client" mkdir "src\generated\grpc-go\client" 2>nul
if not exist "src\generated\grpc-go\client\services" mkdir "src\generated\grpc-go\client\services" 2>nul
echo ✓ Go protobuf directories ready before script

echo Running npx protoc...
protoc --proto_path="proto" --go_out="src/generated/grpc-go" --go_opt=module=github.com/cline/grpc-go --go-grpc_out="src/generated/grpc-go" --go-grpc_opt=module=github.com/cline/grpc-go proto/cline/*.proto proto/host/*.proto
if %errorlevel% neq 0 (
    echo ERROR: Failed to generate Go protobuf files
    exit /b 1
)
REM After npx protoc, ensure go.mod exists
if not exist "src\generated\grpc-go\go.mod" (
    echo Creating go.mod backup...
    (
        echo module github.com/cline/grpc-go
        echo.
        echo go 1.21
        echo.
        echo require ^(
        echo         google.golang.org/grpc v1.65.0
        echo         google.golang.org/protobuf v1.34.2
        echo ^)
        echo.
        echo require ^(
        echo         golang.org/x/net v0.26.0 // indirect
        echo         golang.org/x/sys v0.21.0 // indirect
        echo         golang.org/x/text v0.16.0 // indirect
        echo         google.golang.org/genproto/googleapis/rpc v0.0.0-20240604185151-ef581f913117 // indirect
        echo ^)
) > "src\generated\grpc-go\go.mod"
    echo ✓ go.mod created
)
REM After creating go.mod, initialize the module cache
echo Initializing Go module...
cd src\generated\grpc-go
go mod download
go mod tidy
go list -m all
if %errorlevel% neq 0 (
    echo ERROR: Failed to initialize Go module
    exit /b 1
)

REM DEBUG: Check what's actually generated
echo Checking generated grpc-go contents...
echo === Directory listing ===
dir /b /s
echo.
echo === Package declarations ===
for /r %%f in (*.go) do (
    echo === %%~nf%%~xf ===
    findstr "^package " "%%f"
    echo.
)
echo ✓ Debug output complete

cd ..\..\..

echo ✓ Protobuf files regenerated

echo Running client generation...
call node scripts/generate-clients.mjs 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Client generation failed
    exit /b 1
)
echo ✓ Client generation completed

cd cli

if %errorlevel% neq 0 (
    echo ERROR: Failed to change to cli directory
    exit /b 1
)
echo Changing to cli directory... new working directory: %CD%

echo Reading version information...
for /f "delims=" %%i in ('node -p "require('..\package.json').version"') do set CORE_VERSION=%%i
echo Core version: %CORE_VERSION%

REM Create output directory
if not exist "dist-standalone\extension" mkdir dist-standalone\extension
copy package.json dist-standalone\extension\

REM Extract version information for ldflags
for /f "delims=" %%i in ('node -p "require('./package.json').version"') do set CORE_VERSION=%%i
for /f "delims=" %%i in ('node -p "require('./cli/package.json').version"') do set CLI_VERSION=%%i
for /f "delims=" %%i in ('git rev-parse --short HEAD 2^>nul ^|^| echo unknown') do set COMMIT=%%i
for /f "delims=" %%i in ('wmic os get localdatetime ^| find "."') do set "DATETIME=%%i"
set "DATE=!DATETIME:~0,4!-!DATETIME:~4,2!-!DATETIME:~6,2!T!DATETIME:~8,2!:!DATETIME:~10,2!:!DATETIME:~12,2!Z"
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
echo Working directory: %CD%
echo Go version check: && go version
echo Go PATH: %PATH%

REM Build binaries
set GO111MODULE=on
echo Building bin\cline.exe...
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
