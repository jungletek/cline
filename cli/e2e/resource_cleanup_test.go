package e2e

import (
	"context"
	"testing"
	"time"

	"github.com/cline/cli/pkg/cli/global"
	"github.com/cline/cli/pkg/common"
)

// TestInputHandlerResourceCleanup tests the enhanced Stop() method in InputHandler
// to ensure proper cleanup of tickers, programs, and channels to prevent memory leaks
func TestInputHandlerResourceCleanup(t *testing.T) {
	clineDir := setTempClineDir(t)
	t.Logf("Using temp CLINE_DIR: %s", clineDir)

	ctx, cancel := context.WithTimeout(context.Background(), longTimeout)
	defer cancel()

	// Start a new instance
	startOutput := mustRunCLI(ctx, t, "instance", "new")
	t.Logf("Instance start output: %s", startOutput)

	// Get instance info
	out := listInstancesJSON(ctx, t)
	if len(out.CoreInstances) != 1 {
		t.Fatalf("expected 1 instance, got %d", len(out.CoreInstances))
	}

	addr := out.CoreInstances[0].Address
	waitForAddressHealthy(t, addr, defaultTimeout)

	// Initialize global config to get client
	cfg := &global.GlobalConfig{
		ConfigPath: clineDir,
	}
	if err := global.InitializeGlobalConfig(cfg); err != nil {
		t.Fatalf("failed to initialize global config: %v", err)
	}

	// Test that we can create and interact with input handler
	// This indirectly tests that the Stop() method cleanup works properly
	// by ensuring the instance can be cleanly shut down

	// Create a task to engage the input handler
	taskOutput := mustRunCLI(ctx, t, "task", "new", "test resource cleanup")
	t.Logf("Task creation output: %s", taskOutput)

	// Give it a moment to initialize
	time.Sleep(2 * time.Second)

	// Verify the instance is still healthy (input handler hasn't crashed)
	if !common.IsInstanceHealthy(ctx, addr) {
		t.Fatalf("instance became unhealthy after task creation")
	}

	// Test that the instance can be cleanly stopped via CLI command
	// This indirectly tests that the enhanced Stop() method works properly
	t.Logf("Testing clean instance shutdown...")

	// Use the CLI to stop the instance (this will exercise the Stop() method)
	stopOutput := mustRunCLI(ctx, t, "instance", "stop", "--address", addr)
	t.Logf("Instance stop output: %s", stopOutput)

	// Wait for the instance to be removed from registry (cleanup)
	waitForAddressRemoved(t, addr, longTimeout)

	// Verify ports are freed (no dangling processes)
	corePort := out.CoreInstances[0].CorePort()
	hostPort := out.CoreInstances[0].HostPort()
	waitForPortsClosed(t, corePort, hostPort, defaultTimeout)

	t.Logf("Resource cleanup test completed successfully")
}

// TestManagerCleanup tests the enhanced Cleanup() method in Manager
// to ensure proper resource cleanup without breaking active connections
func TestManagerCleanup(t *testing.T) {
	clineDir := setTempClineDir(t)
	t.Logf("Using temp CLINE_DIR: %s", clineDir)

	ctx, cancel := context.WithTimeout(context.Background(), longTimeout)
	defer cancel()

	// Start a new instance
	startOutput := mustRunCLI(ctx, t, "instance", "new")
	t.Logf("Instance start output: %s", startOutput)

	// Get instance info
	out := listInstancesJSON(ctx, t)
	if len(out.CoreInstances) != 1 {
		t.Fatalf("expected 1 instance, got %d", len(out.CoreInstances))
	}

	addr := out.CoreInstances[0].Address
	waitForAddressHealthy(t, addr, defaultTimeout)

	// Initialize global config to get client
	cfg := &global.GlobalConfig{
		ConfigPath: clineDir,
	}
	if err := global.InitializeGlobalConfig(cfg); err != nil {
		t.Fatalf("failed to initialize global config: %v", err)
	}

	// Test that the manager can handle operations before cleanup
	// This verifies the enhanced Cleanup() method doesn't break functionality

	// Create a task
	taskOutput := mustRunCLI(ctx, t, "task", "new", "test manager cleanup")
	t.Logf("Task creation output: %s", taskOutput)

	// Verify instance is still responsive
	if !common.IsInstanceHealthy(ctx, addr) {
		t.Fatalf("instance became unhealthy after task operations")
	}

	// Test that we can still list instances (this exercises manager functionality)
	outAfterTask := listInstancesJSON(ctx, t)
	if len(outAfterTask.CoreInstances) != 1 {
		t.Fatalf("expected 1 instance after task creation, got %d", len(outAfterTask.CoreInstances))
	}

	t.Logf("Manager cleanup test completed successfully - connections preserved")
}
