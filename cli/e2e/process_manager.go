package e2e

import (
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

// ProcessManager provides cross-platform process management
type ProcessManager struct{}

// KillProcess sends a termination signal to a process
func (pm *ProcessManager) KillProcess(pid int, force bool) error {
	if runtime.GOOS == "windows" {
		return pm.killProcessWindows(pid, force)
	}
	return pm.killProcessUnix(pid, force)
}

// killProcessWindows uses taskkill for Windows
func (pm *ProcessManager) killProcessWindows(pid int, force bool) error {
	args := []string{"/PID", strconv.Itoa(pid)}
	if force {
		args = append(args, "/F") // Force kill
	}
	args = append(args, "/T") // Kill process tree

	cmd := exec.Command("taskkill", args...)
	return cmd.Run()
}

// killProcessUnix uses kill command for Unix-like systems
func (pm *ProcessManager) killProcessUnix(pid int, force bool) error {
	signal := "TERM"
	if force {
		signal = "KILL"
	}

	cmd := exec.Command("kill", fmt.Sprintf("-%s", signal), strconv.Itoa(pid))
	return cmd.Run()
}

// GetProcessByPort finds the PID listening on a port
func (pm *ProcessManager) GetProcessByPort(port int) (int, error) {
	if runtime.GOOS == "windows" {
		return pm.getProcessByPortWindows(port)
	}
	return pm.getProcessByPortUnix(port)
}

func (pm *ProcessManager) getProcessByPortWindows(port int) (int, error) {
	// Use PowerShell to find process by port
	cmd := exec.Command("powershell", "-Command",
		fmt.Sprintf("(Get-NetTCPConnection -LocalPort %d -State Listen).OwningProcess", port))
	output, err := cmd.Output()
	if err != nil {
		return 0, err
	}

	pid, err := strconv.Atoi(strings.TrimSpace(string(output)))
	return pid, err
}

func (pm *ProcessManager) getProcessByPortUnix(port int) (int, error) {
	// Use lsof for Unix-like systems
	cmd := exec.Command("lsof", "-ti", fmt.Sprintf(":%d", port))
	output, err := cmd.Output()
	if err != nil {
		return 0, err
	}

	pid, err := strconv.Atoi(strings.TrimSpace(string(output)))
	return pid, err
}
