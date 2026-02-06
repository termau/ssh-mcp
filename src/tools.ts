/**
 * SSH MCP Tool Definitions
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const allTools: Tool[] = [
  // Connection Management
  {
    name: 'list_connections',
    description: `List all configured SSH connections.

Returns the name, host, port, and username for each connection.
Connections are configured via the SSH_CONNECTIONS environment variable.

Example usage: Before running commands, list connections to see what's available.`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: {
      title: 'List SSH Connections',
      readOnlyHint: true,
    },
  },

  {
    name: 'test_connection',
    description: `Test connectivity to an SSH server.

Attempts to establish an SSH connection and reports success/failure with latency.

Parameters:
  - connection: Name of the connection to test (from list_connections)

Example usage: Verify a server is reachable before running commands.`,
    inputSchema: {
      type: 'object',
      properties: {
        connection: {
          type: 'string',
          description: 'Name of the connection to test',
        },
      },
      required: ['connection'],
    },
    annotations: {
      title: 'Test SSH Connection',
      readOnlyHint: true,
    },
  },

  // Command Execution
  {
    name: 'run_command',
    description: `Execute a command on a remote server via SSH.

Runs a shell command and returns stdout, stderr, and exit code.

Parameters:
  - connection: Name of the connection (from list_connections)
  - command: The shell command to execute
  - timeout: Command timeout in milliseconds (default: 30000)

Example usage: run_command("web1", "uptime")
Example usage: run_command("db1", "systemctl status mysql", 60000)

Returns:
  - stdout: Command standard output
  - stderr: Command standard error
  - code: Exit code (0 = success)`,
    inputSchema: {
      type: 'object',
      properties: {
        connection: {
          type: 'string',
          description: 'Name of the SSH connection to use',
        },
        command: {
          type: 'string',
          description: 'Shell command to execute',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
        },
      },
      required: ['connection', 'command'],
    },
    annotations: {
      title: 'Run SSH Command',
      readOnlyHint: false,
      destructiveHint: true,
    },
  },

  // File Operations
  {
    name: 'read_remote_file',
    description: `Read the contents of a file on a remote server.

Parameters:
  - connection: Name of the connection (from list_connections)
  - path: Absolute path to the file on the remote server

Example usage: read_remote_file("web1", "/etc/nginx/nginx.conf")

Returns the file contents as text.`,
    inputSchema: {
      type: 'object',
      properties: {
        connection: {
          type: 'string',
          description: 'Name of the SSH connection to use',
        },
        path: {
          type: 'string',
          description: 'Absolute path to the file on the remote server',
        },
      },
      required: ['connection', 'path'],
    },
    annotations: {
      title: 'Read Remote File',
      readOnlyHint: true,
    },
  },

  {
    name: 'list_remote_directory',
    description: `List contents of a directory on a remote server.

Parameters:
  - connection: Name of the connection (from list_connections)
  - path: Absolute path to the directory on the remote server

Example usage: list_remote_directory("web1", "/var/log")

Returns a list of files/directories with name, type, size, and modification time.`,
    inputSchema: {
      type: 'object',
      properties: {
        connection: {
          type: 'string',
          description: 'Name of the SSH connection to use',
        },
        path: {
          type: 'string',
          description: 'Absolute path to the directory on the remote server',
        },
      },
      required: ['connection', 'path'],
    },
    annotations: {
      title: 'List Remote Directory',
      readOnlyHint: true,
    },
  },

  {
    name: 'upload_file',
    description: `Upload a local file to a remote server via SFTP.

Parameters:
  - connection: Name of the connection (from list_connections)
  - local_path: Path to the local file
  - remote_path: Destination path on the remote server

Example usage: upload_file("web1", "/tmp/config.txt", "/etc/myapp/config.txt")`,
    inputSchema: {
      type: 'object',
      properties: {
        connection: {
          type: 'string',
          description: 'Name of the SSH connection to use',
        },
        local_path: {
          type: 'string',
          description: 'Path to the local file to upload',
        },
        remote_path: {
          type: 'string',
          description: 'Destination path on the remote server',
        },
      },
      required: ['connection', 'local_path', 'remote_path'],
    },
    annotations: {
      title: 'Upload File',
      readOnlyHint: false,
      destructiveHint: true,
    },
  },

  {
    name: 'download_file',
    description: `Download a file from a remote server via SFTP.

Parameters:
  - connection: Name of the connection (from list_connections)
  - remote_path: Path to the file on the remote server
  - local_path: Destination path on the local machine

Example usage: download_file("web1", "/var/log/nginx/error.log", "/tmp/error.log")`,
    inputSchema: {
      type: 'object',
      properties: {
        connection: {
          type: 'string',
          description: 'Name of the SSH connection to use',
        },
        remote_path: {
          type: 'string',
          description: 'Path to the file on the remote server',
        },
        local_path: {
          type: 'string',
          description: 'Destination path on the local machine',
        },
      },
      required: ['connection', 'remote_path', 'local_path'],
    },
    annotations: {
      title: 'Download File',
      readOnlyHint: false,
    },
  },

  // Connection Management (persistent)
  {
    name: 'add_connection',
    description: `Add or update a manual SSH connection. Persisted to config file across restarts.

Parameters:
  - name: Unique name for this connection (required)
  - host: Server hostname or IP address (required)
  - port: SSH port (default: 22)
  - username: SSH username (required)
  - privateKeyPath: Path to SSH private key (supports ~ expansion)
  - password: SSH password (if not using key auth)

Example: add_connection("staging", "10.0.0.5", 22, "deploy", "~/.ssh/deploy_key")`,
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Unique name for this connection',
        },
        host: {
          type: 'string',
          description: 'Server hostname or IP address',
        },
        port: {
          type: 'number',
          description: 'SSH port (default: 22)',
        },
        username: {
          type: 'string',
          description: 'SSH username',
        },
        privateKeyPath: {
          type: 'string',
          description: 'Path to SSH private key (supports ~ expansion)',
        },
        password: {
          type: 'string',
          description: 'SSH password (if not using key auth)',
        },
      },
      required: ['name', 'host', 'username'],
    },
    annotations: {
      title: 'Add SSH Connection',
      readOnlyHint: false,
    },
  },

  {
    name: 'remove_connection',
    description: `Remove a manual SSH connection from the config file.

Only removes connections added via add_connection (source: config).
Auto-discovered BinaryLane connections cannot be removed this way.

Parameters:
  - name: Name of the connection to remove`,
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the connection to remove',
        },
      },
      required: ['name'],
    },
    annotations: {
      title: 'Remove SSH Connection',
      readOnlyHint: false,
      destructiveHint: true,
    },
  },

  {
    name: 'refresh_connections',
    description: `Re-discover BinaryLane servers and reload all connections.

Refreshes the connection list by:
1. Re-reading the config file
2. Re-discovering BinaryLane servers (if enabled)
3. Re-reading SSH_CONNECTIONS env var
4. Merging all sources (config > env > auto-discovered)

Use after creating/deleting BinaryLane servers to update the connection list.`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: {
      title: 'Refresh Connections',
      readOnlyHint: true,
    },
  },

  {
    name: 'get_config',
    description: `Show the current SSH MCP configuration.

Returns the config file contents with sensitive values (tokens, passwords) redacted.
Shows BinaryLane auto-discovery settings and all manual connections.`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: {
      title: 'Get SSH MCP Config',
      readOnlyHint: true,
    },
  },
];
