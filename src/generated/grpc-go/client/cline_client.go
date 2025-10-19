package client

import (
	"context"

	"github.com/cline/grpc-go/cline"
	"google.golang.org/grpc"
)

// ClineClient combines all service clients
type ClineClient struct {
	Task		cline.TaskServiceClient
	Account		cline.AccountServiceClient
	Browser		cline.BrowserServiceClient
	Checkpoints	cline.CheckpointsServiceClient
	Commands	cline.CommandsServiceClient
	Dictation	cline.DictationServiceClient
	File		cline.FileServiceClient
	Mcp			cline.McpServiceClient
	Models		cline.ModelsServiceClient
	OcaAccount	cline.OcaAccountServiceClient
	Slash		cline.SlashServiceClient
	State		cline.StateServiceClient
	Ui			cline.UiServiceClient
	Web			cline.WebServiceClient
}

// NewClineClient creates a new ClineClient with all service clients
func NewClineClient(target string) (*ClineClient, error) {
	conn, err := grpc.Dial(target, grpc.WithInsecure())
	if err != nil {
		return nil, err
	}

	// Note: In a real implementation, you'd want to share the connection
	// and handle connection lifecycle properly
	return &ClineClient{
		Task:			cline.NewTaskServiceClient(conn),
		Account:		cline.NewAccountServiceClient(conn),
		Browser:		cline.NewBrowserServiceClient(conn),
		Checkpoints:	cline.NewCheckpointsServiceClient(conn),
		Commands:		cline.NewCommandsServiceClient(conn),
		Dictation:		cline.NewDictationServiceClient(conn),
		File:			cline.NewFileServiceClient(conn),
		Mcp:			cline.NewMcpServiceClient(conn),
		Models:			cline.NewModelsServiceClient(conn),
		OcaAccount:		cline.NewOcaAccountServiceClient(conn),
		Slash:			cline.NewSlashServiceClient(conn),
		State:			cline.NewStateServiceClient(conn),
		Ui:				cline.NewUiServiceClient(conn),
		Web:			cline.NewWebServiceClient(conn),
	}, nil
}

// Connect establishes connection (placeholder for future implementation)
func (c *ClineClient) Connect(ctx context.Context) error {
	// Connection is established in NewClineClient for now
	// In a real implementation, this would handle connection lifecycle
	return nil
}

// Close closes all connections (placeholder for future implementation)
func (c *ClineClient) Close() error {
	// In a real implementation, this would close the shared connection
	return nil
}