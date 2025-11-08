//go:build windows

package e2e

import (
	"testing"
)

// TestWindowsProcessManagement validates Windows-specific process management
func TestWindowsProcessManagement(t *testing.T) {
	pm := &ProcessManager{}

	// Test port discovery on a port that should be free
	pid, err := pm.GetProcessByPort(8080)
	if err != nil {
		t.Logf("Port 8080 not in use (expected): %v", err)
	} else if pid > 0 {
		t.Logf("Port 8080 is in use by PID %d", pid)
	}

	// Test invalid PID handling
	err = pm.KillProcess(99999, false)
	if err == nil {
		t.Error("Expected error when killing non-existent process")
	}

	// Test force kill flag
	err = pm.KillProcess(99999, true)
	if err == nil {
		t.Error("Expected error when force killing non-existent process")
	}
}

// TestWindowsPortDetection validates port detection works on Windows
func TestWindowsPortDetection(t *testing.T) {
	pm := &ProcessManager{}

	// Test with a few common ports that should be free in test environment
	testPorts := []int{31234, 41234, 51234}

	for _, port := range testPorts {
		pid, err := pm.GetProcessByPort(port)
		if err != nil {
			t.Logf("Port %d not in use (expected): %v", port, err)
		} else if pid > 0 {
			t.Logf("Port %d is in use by PID %d", port, pid)
		}
	}
}
