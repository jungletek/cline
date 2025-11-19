#!/usr/bin/env node

import chalk from "chalk"
import { execSync } from "child_process"
import * as fs from "fs/promises"
import { globby } from "globby"
import { createRequire } from "module"
import * as path from "path"
import { fileURLToPath } from "url"
import { createServiceNameMap, parseProtoForServices } from "./proto-shared-utils.mjs"

const require = createRequire(import.meta.url)
const PROTOC = path.join(require.resolve("grpc-tools"), "../bin/protoc")

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..")
const PROTO_DIR = path.resolve(ROOT_DIR, "proto")
const GO_PROTO_DIR = path.join(ROOT_DIR, "src", "generated", "grpc-go")
const GO_CLIENT_DIR = path.join(GO_PROTO_DIR, "client")
const GO_SERVICE_CLIENT_DIR = path.join(GO_CLIENT_DIR, "services")

const COMMON_TYPES = ["StringRequest", "EmptyRequest", "Empty", "String", "Int64Request", "KeyValuePair"]

// Check if Go is installed
function checkGoInstallation() {
	try {
		execSync("go version", { stdio: "pipe" })
		return true
	} catch (error) {
		return false
	}
}

// Check if a Go tool is available
function checkGoTool(toolName) {
	try {
		execSync(`which ${toolName}`, { stdio: "pipe" })
		return true
	} catch (error) {
		// On Windows, 'which' might not be available, try 'where'
		try {
			execSync(`where ${toolName}`, { stdio: "pipe" })
			return true
		} catch (windowsError) {
			return false
		}
	}
}

// Install Go protobuf tools
function installGoTools() {
	console.log(chalk.yellow("Installing Go protobuf tools..."))

	const tools = ["google.golang.org/protobuf/cmd/protoc-gen-go@latest", "google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest"]

	for (const tool of tools) {
		try {
			console.log(chalk.cyan(`Installing ${tool}...`))
			execSync(`GO111MODULE=on go install ${tool}`, {
				stdio: "inherit",
				env: { ...process.env, GO111MODULE: "on" },
			})
		} catch (error) {
			console.error(chalk.red(`Failed to install ${tool}:`), error.message)
			process.exit(1)
		}
	}

	console.log(chalk.green("Go protobuf tools installed successfully!"))
}

// Check if tools are in PATH and provide guidance
function checkToolsInPath() {
	const tools = ["protoc-gen-go", "protoc-gen-go-grpc"]
	const missingTools = []

	for (const tool of tools) {
		if (!checkGoTool(tool)) {
			missingTools.push(tool)
		}
	}

	if (missingTools.length > 0) {
		console.log(chalk.yellow("Warning: Some Go protobuf tools are not in your PATH:"))
		missingTools.forEach((tool) => {
			console.log(chalk.yellow(`  - ${tool}`))
		})
		console.log()
		console.log(chalk.cyan("To fix this, add your Go bin directory to your PATH:"))

		// Get GOPATH and GOBIN
		let goPath, goBin
		try {
			goPath = execSync("go env GOPATH", { encoding: "utf8" }).trim()
			goBin = execSync("go env GOBIN", { encoding: "utf8" }).trim()
		} catch (error) {
			console.log(chalk.red("Could not determine Go paths. Please check your Go installation."))
			process.exit(1)
		}

		const binPath = goBin || path.join(goPath, "bin")

		if (process.platform === "win32") {
			console.log(chalk.cyan(`  Windows (Command Prompt): set PATH=%PATH%;${binPath}`))
			console.log(chalk.cyan(`  Windows (PowerShell): $env:PATH += ";${binPath}"`))
			console.log(chalk.cyan(`  Or add "${binPath}" to your system PATH through System Properties`))
		} else {
			console.log(chalk.cyan(`  Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):`))
			console.log(chalk.cyan(`  export PATH="$PATH:${binPath}"`))
			console.log(chalk.cyan(`  Then run: source ~/.bashrc (or restart your terminal)`))
		}
		console.log()

		// Try to continue anyway, as the tools might still work
		console.log(chalk.yellow("Attempting to continue anyway..."))
	}
}

// Setup Go dependencies
async function setupGoDependencies() {
	console.log(chalk.cyan("Checking Go dependencies..."))

	// Check if Go is installed
	if (!checkGoInstallation()) {
		console.error(chalk.red("Error: Go is not installed or not in PATH."))
		console.error(chalk.red("Please install Go from https://golang.org/dl/ and ensure it's in your PATH."))
		process.exit(1)
	}

	console.log(chalk.green("✓ Go is installed"))

	// Check if protobuf tools are available
	const tools = ["protoc-gen-go", "protoc-gen-go-grpc"]
	const missingTools = tools.filter((tool) => !checkGoTool(tool))

	if (missingTools.length > 0) {
		console.log(chalk.yellow(`Missing Go protobuf tools: ${missingTools.join(", ")}`))
		installGoTools()
	} else {
		console.log(chalk.green("✓ Go protobuf tools are available"))
	}

	// Verify tools are in PATH
	checkToolsInPath()
}

export async function goProtoc(outDir, protoFiles) {
	// Setup dependencies first
	console.log(chalk.cyan("Step 1: Setting up Go dependencies..."))
	try {
		await setupGoDependencies()
		console.log(chalk.green("✓ Go dependencies setup complete"))
	} catch (error) {
		console.error(chalk.red("FAILED: Go dependencies setup:"), error.message)
		throw error
	}

	// Create output directory if it doesn't exist
	console.log(chalk.cyan("Step 2: Creating output directory..."))
	try {
		await fs.mkdir(outDir, { recursive: true })
		console.log(chalk.green("✓ Output directory created"))
	} catch (error) {
		console.error(chalk.red("FAILED: Create output directory:"), error.message)
		throw error
	}

	// Simple protoc command - proto files now have correct go_package paths
	const goProtocCommand = [
		PROTOC,
		`--proto_path="${PROTO_DIR}"`,
		`--go_out="${outDir}"`,
		`--go_opt=module=github.com/cline/grpc-go`,
		`--go-grpc_out="${outDir}"`,
		`--go-grpc_opt=module=github.com/cline/grpc-go`,
		...protoFiles,
	].join(" ")

	console.log(chalk.cyan("Step 3: Running protoc command..."))
	console.log(chalk.gray(`Command: ${goProtocCommand}`))
	try {
		execSync(goProtocCommand, { stdio: "inherit" })
		console.log(chalk.green("✓ Protoc command executed successfully"))
	} catch (error) {
		console.error(chalk.red("FAILED: Protoc command execution:"), error.message)
		console.error(chalk.red("Exit code:"), error.status || "unknown")

		// Provide additional help if the error might be related to missing tools
		if (error.message.includes("protoc-gen-go")) {
			console.log()
			console.log(chalk.yellow("This error might be caused by Go protobuf tools not being in your PATH."))
			console.log(chalk.yellow("Please ensure the tools are properly installed and accessible."))
		}
		throw error
	}

	console.log(chalk.cyan("Step 4: Generating Go module file..."))
	try {
		await generateGoMod()
		console.log(chalk.green("✓ Go module file generated"))
	} catch (error) {
		console.error(chalk.red("FAILED: Go module generation:"), error.message)
		throw error
	}

	console.log(chalk.cyan("Step 5: Generating Go connection manager..."))
	try {
		await generateGoConnection()
		console.log(chalk.green("✓ Go connection manager generated"))
	} catch (error) {
		console.error(chalk.red("FAILED: Go connection generation:"), error.message)
		throw error
	}

	console.log(chalk.cyan("Step 6: Generating Go client..."))
	try {
		await generateGoClient()
		console.log(chalk.green("✓ Go client generated"))
	} catch (error) {
		console.error(chalk.red("FAILED: Go client generation:"), error.message)
		throw error
	}

	console.log(chalk.cyan("Step 7: Generating Go service clients..."))
	try {
		await generateGoServiceClients()
		console.log(chalk.green("✓ Go service clients generated"))
	} catch (error) {
		console.error(chalk.red("FAILED: Go service clients generation:"), error.message)
		throw error
	}
}

async function generateGoMod() {
	console.log(chalk.cyan("Generating Go module file..."))

	const goModContent = `module github.com/cline/grpc-go

go 1.21

require (
	google.golang.org/grpc v1.65.0
	google.golang.org/protobuf v1.34.2
)

require (
	golang.org/x/net v0.26.0 // indirect
	golang.org/x/sys v0.21.0 // indirect
	golang.org/x/text v0.16.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20240604185151-ef581f913117 // indirect
)
`

	const goModPath = path.join(GO_PROTO_DIR, "go.mod")
	await fs.writeFile(goModPath, goModContent)
	console.log(chalk.green(`Generated Go module file at ${goModPath}`))
}

async function generateGoConnection() {
	console.log(chalk.cyan("Generating Go connection manager..."))

	// Create client directory if it doesn't exist
	await fs.mkdir(GO_CLIENT_DIR, { recursive: true })

	const content = `// AUTO-GENERATED FILE - DO NOT MODIFY DIRECTLY
// Generated by scripts/build-go-proto.mjs

package client

import (
	"context"
	"fmt"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// ConnectionConfig holds configuration for gRPC connection
type ConnectionConfig struct {
	Address string
	Timeout time.Duration
}

// ConnectionManager manages gRPC connections
type ConnectionManager struct {
	config *ConnectionConfig
	conn   *grpc.ClientConn
	mutex  sync.RWMutex
}

// NewConnectionManager creates a new connection manager
func NewConnectionManager(config *ConnectionConfig) *ConnectionManager {
	if config.Timeout == 0 {
		config.Timeout = 30 * time.Second
	}

	return &ConnectionManager{
		config: config,
	}
}

// Connect establishes a gRPC connection
func (cm *ConnectionManager) Connect(ctx context.Context) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	if cm.conn != nil {
		return nil // Already connected
	}

	// Create context with timeout
	connectCtx, cancel := context.WithTimeout(ctx, cm.config.Timeout)
	defer cancel()

	// Establish gRPC connection
	conn, err := grpc.DialContext(connectCtx, cm.config.Address,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return fmt.Errorf("failed to connect to %s: %w", cm.config.Address, err)
	}

	cm.conn = conn
	return nil
}

// Disconnect closes the gRPC connection
func (cm *ConnectionManager) Disconnect() error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	if cm.conn == nil {
		return nil // Already disconnected
	}

	err := cm.conn.Close()
	cm.conn = nil
	return err
}

// GetConnection returns the current gRPC connection
func (cm *ConnectionManager) GetConnection() *grpc.ClientConn {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()
	return cm.conn
}

// IsConnected returns true if connected
func (cm *ConnectionManager) IsConnected() bool {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()
	return cm.conn != nil
}
`

	const connectionPath = path.join(GO_CLIENT_DIR, "connection.go")
	await fs.writeFile(connectionPath, content)
	console.log(chalk.green(`Generated Go connection manager at ${connectionPath}`))
}

async function generateGoClient() {
	console.log(chalk.cyan("Generating Go client..."))

	// Create client directory if it doesn't exist
	await fs.mkdir(GO_CLIENT_DIR, { recursive: true })

	// Get all proto files and parse services
	const protoFiles = await globby("**/*.proto", { cwd: PROTO_DIR })
	const services = await parseProtoForServices(protoFiles, PROTO_DIR)
	const serviceNameMap = createServiceNameMap(services)

	const serviceClients = Object.keys(serviceNameMap)
		.map(
			(name) =>
				`\t${name.charAt(0).toUpperCase() + name.slice(1)} *services.${name.charAt(0).toUpperCase() + name.slice(1)}Client`,
		)
		.join("\n")

	const serviceInitializers = Object.keys(serviceNameMap)
		.map(
			(name) =>
				`\tc.${name.charAt(0).toUpperCase() + name.slice(1)} = services.New${name.charAt(0).toUpperCase() + name.slice(1)}Client(conn)`,
		)
		.join("\n")

	const serviceNilOut = Object.keys(serviceNameMap)
		.map((name) => `\tc.${name.charAt(0).toUpperCase() + name.slice(1)} = nil`)
		.join("\n")

	const content = `// AUTO-GENERATED FILE - DO NOT MODIFY DIRECTLY
// Generated by scripts/build-go-proto.mjs

package client

import (
	"context"
	"fmt"
	"sync"

	"google.golang.org/grpc"
	"github.com/cline/grpc-go/client/services"
)

// ClineClient provides a unified interface to all Cline services
type ClineClient struct {
	connManager *ConnectionManager
	
	// Service clients
${serviceClients}
	
	// Connection state
	mutex     sync.RWMutex
	connected bool
}

// NewClineClient creates a new unified Cline client
func NewClineClient(address string) (*ClineClient, error) {
	config := &ConnectionConfig{
		Address: address,
	}
	
	connManager := NewConnectionManager(config)
	
	return &ClineClient{
		connManager: connManager,
	}, nil
}

// NewClineClientWithConfig creates a new Cline client with custom configuration
func NewClineClientWithConfig(config *ConnectionConfig) (*ClineClient, error) {
	connManager := NewConnectionManager(config)
	
	return &ClineClient{
		connManager: connManager,
	}, nil
}

// Connect establishes connection to Cline Core and initializes service clients
func (c *ClineClient) Connect(ctx context.Context) error {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	
	if c.connected {
		return nil
	}
	
	// Establish gRPC connection
	if err := c.connManager.Connect(ctx); err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	
	// Initialize service clients
	conn := c.connManager.GetConnection()
${serviceInitializers}
	
	c.connected = true
	return nil
}

// Disconnect closes the connection to Cline Core
func (c *ClineClient) Disconnect() error {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	
	if !c.connected {
		return nil
	}
	
	err := c.connManager.Disconnect()
	c.connected = false
	
	// Clear service clients
${serviceNilOut}
	
	return err
}

// IsConnected returns true if the client is connected to Cline Core
func (c *ClineClient) IsConnected() bool {
	c.mutex.RLock()
	defer c.mutex.RUnlock()
	return c.connected
}

// Reconnect closes the current connection and establishes a new one
func (c *ClineClient) Reconnect(ctx context.Context) error {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	
	// Disconnect first
	if c.connected {
		if err := c.connManager.Disconnect(); err != nil {
			return fmt.Errorf("failed to disconnect: %w", err)
		}
		c.connected = false
	}
	
	// Reconnect
	if err := c.connManager.Connect(ctx); err != nil {
		return fmt.Errorf("failed to reconnect: %w", err)
	}
	
	// Reinitialize service clients
	conn := c.connManager.GetConnection()
${serviceInitializers}
	
	c.connected = true
	return nil
}

// GetConnection returns the underlying gRPC connection
func (c *ClineClient) GetConnection() *grpc.ClientConn {
	return c.connManager.GetConnection()
}
`
	const clientPath = path.join(GO_CLIENT_DIR, "cline_client.go")
	await fs.writeFile(clientPath, content)
	console.log(chalk.green(`Generated Go client at ${clientPath}`))
}

async function generateGoServiceClients() {
	console.log(chalk.cyan("Generating Go service clients..."))
	await fs.mkdir(GO_SERVICE_CLIENT_DIR, { recursive: true })

	const protoFiles = await globby("**/*.proto", { cwd: PROTO_DIR })
	const services = await parseProtoForServices(protoFiles, PROTO_DIR)

	for (const [serviceName, serviceDef] of Object.entries(services)) {
		const capitalizedServiceName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
		const clientFileName = `${serviceName}_client.go`
		const clientPath = path.join(GO_SERVICE_CLIENT_DIR, clientFileName)

		const methods = serviceDef.methods
			.map((method) => {
				const capitalizedMethodName = method.name.charAt(0).toUpperCase() + method.name.slice(1)

				// Determine if types are from cline package (common types) or proto package (service-specific types)
				const requestTypeName = method.requestType.split(".").pop()
				const responseTypeName = method.responseType.split(".").pop()

				// Common types like StringRequest, Empty, etc. are in the cline package
				const requestType = COMMON_TYPES.includes(requestTypeName)
					? `*cline.${requestTypeName}`
					: `*proto.${requestTypeName}`
				const responseType = COMMON_TYPES.includes(responseTypeName)
					? `*cline.${responseTypeName}`
					: `*proto.${responseTypeName}`

				if (method.isResponseStreaming) {
					return `
// ${capitalizedMethodName} subscribes to ${method.name} updates and returns a stream
func (sc *${capitalizedServiceName}Client) ${capitalizedMethodName}(ctx context.Context, req ${requestType}) (proto.${serviceDef.name}_${capitalizedMethodName}Client, error) {
	stream, err := sc.client.${capitalizedMethodName}(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to subscribe to ${method.name}: %w", err)
	}

	return stream, nil
}`
				} else {
					return `
// ${capitalizedMethodName} retrieves the current application ${method.name}
func (sc *${capitalizedServiceName}Client) ${capitalizedMethodName}(ctx context.Context, req ${requestType}) (${responseType}, error) {
	resp, err := sc.client.${capitalizedMethodName}(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to get latest ${method.name}: %w", err)
	}

	return resp, nil
}`
				}
			})
			.join("\n")

		// Determine the correct proto import path based on the service location
		const protoImportPath =
			serviceDef.protoPackage === "host" ? '"github.com/cline/grpc-go/host"' : '"github.com/cline/grpc-go/cline"'

		// Check if we need to import cline package for common types
		const needsClineImport = serviceDef.methods.some((method) => {
			const requestTypeName = method.requestType.split(".").pop()
			const responseTypeName = method.responseType.split(".").pop()
			const commonTypes = ["StringRequest", "EmptyRequest", "Empty", "String", "Int64Request", "KeyValuePair"]
			return commonTypes.includes(requestTypeName) || commonTypes.includes(responseTypeName)
		})

		// Always import cline package if we need common types, regardless of service package
		const clineImport = needsClineImport ? '	cline "github.com/cline/grpc-go/cline"\n' : ""

		const content = `// AUTO-GENERATED FILE - DO NOT MODIFY DIRECTLY
// Generated by scripts/build-go-proto.mjs

package services

import (
	"context"
	"fmt"

${clineImport}	proto ${protoImportPath}
	"google.golang.org/grpc"
)

// ${capitalizedServiceName}Client wraps the generated ${serviceDef.name} gRPC client
type ${capitalizedServiceName}Client struct {
	client proto.${serviceDef.name}Client
}

// New${capitalizedServiceName}Client creates a new ${capitalizedServiceName}Client
func New${capitalizedServiceName}Client(conn *grpc.ClientConn) *${capitalizedServiceName}Client {
	return &${capitalizedServiceName}Client{
		client: proto.New${serviceDef.name}Client(conn),
	}
}
${methods}
`
		await fs.writeFile(clientPath, content)
		console.log(chalk.green(`Generated Go service client at ${clientPath}`))
	}
}

// Main execution block - run if this script is executed directly
if (process.argv[1] && process.argv[1].endsWith("build-go-proto.mjs")) {
	async function main() {
		console.log(chalk.blue.bold("Starting Go protobuf code generation..."))

		try {
			console.log(chalk.cyan("Step 1: Discovering proto files..."))
			const protoFiles = await globby("**/*.proto", { cwd: PROTO_DIR })
			console.log(chalk.green(`✓ Found ${protoFiles.length} proto files`))
			for (const file of protoFiles) {
				console.log(chalk.gray(`  - ${file}`))
			}

			if (protoFiles.length === 0) {
				throw new Error(`No .proto files found in ${PROTO_DIR}`)
			}

			// Set output directory for Go code - use the new location
			const goOutDir = GO_PROTO_DIR
			console.log(chalk.cyan(`Step 2: Using output directory: ${goOutDir}`))

			// Call the goProtoc function
			await goProtoc(goOutDir, protoFiles)

			console.log(chalk.green.bold("Go protobuf code generation completed successfully!"))
			console.log(chalk.green(`Output directory: ${goOutDir}`))
			console.log(chalk.green("Generated: protobuf stubs, Go clients, connection managers, service wrappers"))
		} catch (error) {
			console.error(chalk.red.bold("CRITICAL: Go protobuf generation FAILED"))
			console.error(chalk.red("Error details:"), error.message)
			console.error(chalk.red("Stack trace:"), error.stack)

			// Check for common failure causes
			if (error.message.includes("ENOENT")) {
				console.error(chalk.yellow("Possible cause: Missing protocol buffer tools or files"))
			} else if (error.message.includes("grpc-tools")) {
				console.error(chalk.yellow("Possible cause: Node.js grpc-tools package not installed"))
				console.error(chalk.yellow("   Try: npm install"))
			} else if (error.message.includes("protoc-gen-go")) {
				console.error(chalk.yellow("Possible cause: Go protobuf plugins not in PATH"))
				console.error(chalk.yellow("   Try: go install google.golang.org/protobuf/cmd/protoc-gen-go@latest"))
			} else if (error.message.includes("Cannot find module")) {
				console.error(chalk.yellow("Possible cause: Missing Node.js dependency"))
				console.error(chalk.yellow("   Try: npm install"))
			}

			console.error(chalk.red.bold("🔍 Please check the error details above and fix the issues"))
			process.exit(1)
		}
	}

	console.log(chalk.blue("🔧 Executing main() function..."))
	main().catch((unexpectedError) => {
		console.error(chalk.red.bold("UNEXPECTED CRITICAL FAILURE:"))
		console.error(chalk.red("This error bypassed normal error handling:"), unexpectedError)
		process.exit(1)
	})
}
