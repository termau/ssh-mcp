# SSH MCP Server

A Model Context Protocol (MCP) server for executing commands and managing files on remote servers via SSH.

Optionally auto-discovers [BinaryLane](https://www.binarylane.com.au/) VPS servers so they're available immediately.

## Features

- Execute shell commands on remote servers
- Read files and list directories remotely
- Upload and download files via SFTP
- Persistent connections saved to config file across restarts
- BinaryLane auto-discovery of active servers
- Per-connection SSH key configuration
- Multiple connection sources with clear priority

## Installation

```bash
npm install
npm run build
```

## Configuration

### Claude Desktop / Claude Code

Add to your Claude configuration:

```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": ["/path/to/ssh-mcp/dist/index.js"],
      "env": {
        "BINARYLANE_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

The `BINARYLANE_API_TOKEN` is optional — only needed for auto-discovery of BinaryLane servers.

### Config File

On first run, a config file is created at `~/.config/ssh-mcp/connections.json`:

```json
{
  "defaultPrivateKeyPath": "~/.ssh/id_ed25519",
  "binarylane": {
    "enabled": true,
    "apiToken": "your-token-here",
    "defaultUsername": "root",
    "defaultPrivateKeyPath": "~/.ssh/id_ed25519"
  },
  "connections": [
    {
      "name": "my-server",
      "host": "10.0.0.5",
      "port": 22,
      "username": "deploy",
      "privateKeyPath": "~/.ssh/deploy_key"
    }
  ]
}
```

The BinaryLane API token can be set here or as an environment variable.

### Environment Variable (Legacy)

Still supported for backward compatibility:

```bash
export SSH_CONNECTIONS='[
  {"name": "web1", "host": "192.168.1.10", "port": 22, "username": "root", "privateKeyPath": "~/.ssh/id_rsa"}
]'
```

### Connection Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `name` | Yes | - | Unique identifier for the connection |
| `host` | Yes | - | Server hostname or IP address |
| `port` | No | 22 | SSH port |
| `username` | Yes | - | SSH username |
| `privateKeyPath` | No | - | Path to SSH private key (supports `~` expansion) |
| `password` | No | - | SSH password (if not using key auth) |

If neither `privateKeyPath` nor `password` is provided, the server will try default SSH key locations (`~/.ssh/id_ed25519`, `~/.ssh/id_rsa`).

### Connection Priority

When multiple sources define the same connection name:

1. **Config file** (highest) — manual connections from `~/.config/ssh-mcp/connections.json`
2. **Environment variable** — `SSH_CONNECTIONS`
3. **BinaryLane auto-discovery** (lowest) — active servers from the API

## Available Tools

### Connection Management

- `list_connections` — List all available SSH connections with source info
- `test_connection` — Test connectivity with latency reporting
- `add_connection` — Add a connection (persisted to config file)
- `remove_connection` — Remove a manual connection from config
- `refresh_connections` — Re-discover BinaryLane servers and reload all connections
- `get_config` — Show current configuration (tokens redacted)

### Command Execution

- `run_command` — Execute a shell command with configurable timeout

### File Operations

- `read_remote_file` — Read file contents via SFTP
- `list_remote_directory` — List directory contents with metadata
- `upload_file` — Upload a local file to remote server
- `download_file` — Download a remote file to local machine

## Example Usage

```
# List all connections (shows source: config, env, or binarylane)
list_connections

# Test connection
test_connection connection="web1"

# Run a command
run_command connection="web1" command="uptime"

# Add a new persistent connection
add_connection name="staging" host="10.0.0.5" username="deploy" privateKeyPath="~/.ssh/deploy_key"

# Refresh after creating new BinaryLane servers
refresh_connections
```

## Security Notes

- SSH keys are read from your local filesystem and never transmitted or stored by the MCP
- Passwords in config are only held in memory during operation
- The config file should be protected with appropriate filesystem permissions
- Commands are executed with the privileges of the SSH user
- Consider using dedicated SSH keys with limited permissions for automation

## Development

```bash
npm run dev    # Watch mode
npm run build  # Compile TypeScript
npm start      # Run compiled server
```

## Project Structure

```
ssh-mcp/
├── src/
│   ├── index.ts        # Server entry point
│   ├── ssh-client.ts   # SSH connection manager
│   ├── config.ts       # Persistent config file management
│   ├── binarylane.ts   # BinaryLane auto-discovery
│   ├── tools.ts        # MCP tool definitions
│   └── handlers.ts     # Tool handler implementations
├── dist/               # Compiled JavaScript
├── package.json
└── tsconfig.json
```

## License

MIT
