/**
 * SSH MCP Tool Handlers
 */

import { z } from 'zod';
import { SSHClientManager } from './ssh-client.js';
import {
  loadConfig,
  addConnectionToConfig,
  removeConnectionFromConfig,
  redactConfig,
  getConfigPath,
  type SSHMCPConfig,
} from './config.js';

// Input schemas
const listConnectionsSchema = z.object({});

const testConnectionSchema = z.object({
  connection: z.string().min(1, 'Connection name is required'),
});

const runCommandSchema = z.object({
  connection: z.string().min(1, 'Connection name is required'),
  command: z.string().min(1, 'Command is required'),
  timeout: z.number().optional().default(30000),
});

const readRemoteFileSchema = z.object({
  connection: z.string().min(1, 'Connection name is required'),
  path: z.string().min(1, 'Path is required'),
});

const listRemoteDirectorySchema = z.object({
  connection: z.string().min(1, 'Connection name is required'),
  path: z.string().min(1, 'Path is required'),
});

const uploadFileSchema = z.object({
  connection: z.string().min(1, 'Connection name is required'),
  local_path: z.string().min(1, 'Local path is required'),
  remote_path: z.string().min(1, 'Remote path is required'),
});

const downloadFileSchema = z.object({
  connection: z.string().min(1, 'Connection name is required'),
  remote_path: z.string().min(1, 'Remote path is required'),
  local_path: z.string().min(1, 'Local path is required'),
});

const addConnectionSchema = z.object({
  name: z.string().min(1, 'Connection name is required'),
  host: z.string().min(1, 'Host is required'),
  port: z.number().optional().default(22),
  username: z.string().min(1, 'Username is required'),
  privateKeyPath: z.string().optional(),
  password: z.string().optional(),
});

const removeConnectionSchema = z.object({
  name: z.string().min(1, 'Connection name is required'),
});

// Context passed to handlers that need config/reload access
export interface HandlerContext {
  sshManager: SSHClientManager;
  reloadConnections: () => Promise<void>;
}

// Handler type
type Handler = (client: SSHClientManager, args: Record<string, unknown>, ctx?: HandlerContext) => Promise<unknown>;

// Handlers
export const allHandlers: Record<string, Handler> = {
  // List all configured connections
  list_connections: async (client, args) => {
    listConnectionsSchema.parse(args);
    const connections = client.listConnections();

    if (connections.length === 0) {
      return {
        connections: [],
        message: 'No SSH connections configured. Use add_connection to add one, or enable BinaryLane auto-discovery.',
      };
    }

    return {
      connections,
      count: connections.length,
    };
  },

  // Test connection to a server
  test_connection: async (client, args) => {
    const { connection } = testConnectionSchema.parse(args);
    return await client.testConnection(connection);
  },

  // Execute a command on a remote server
  run_command: async (client, args) => {
    const { connection, command, timeout } = runCommandSchema.parse(args);
    const result = await client.runCommand(connection, command, timeout);

    return {
      connection,
      command,
      ...result,
      success: result.code === 0,
    };
  },

  // Read a file from a remote server
  read_remote_file: async (client, args) => {
    const { connection, path } = readRemoteFileSchema.parse(args);
    const content = await client.readFile(connection, path);

    return {
      connection,
      path,
      content,
      size: content.length,
    };
  },

  // List directory contents on a remote server
  list_remote_directory: async (client, args) => {
    const { connection, path } = listRemoteDirectorySchema.parse(args);
    const entries = await client.listDirectory(connection, path);

    return {
      connection,
      path,
      entries,
      count: entries.length,
    };
  },

  // Upload a file to a remote server
  upload_file: async (client, args) => {
    const { connection, local_path, remote_path } = uploadFileSchema.parse(args);
    return await client.uploadFile(connection, local_path, remote_path);
  },

  // Download a file from a remote server
  download_file: async (client, args) => {
    const { connection, remote_path, local_path } = downloadFileSchema.parse(args);
    return await client.downloadFile(connection, remote_path, local_path);
  },

  // Add a manual SSH connection (persisted)
  add_connection: async (client, args, ctx) => {
    const input = addConnectionSchema.parse(args);

    const config = loadConfig();
    addConnectionToConfig(config, {
      name: input.name,
      host: input.host,
      port: input.port,
      username: input.username,
      privateKeyPath: input.privateKeyPath,
      password: input.password,
    });

    // Reload all connections so the new one is available immediately
    if (ctx?.reloadConnections) {
      await ctx.reloadConnections();
    }

    return {
      success: true,
      message: `Connection '${input.name}' saved to ${getConfigPath()}`,
      connection: {
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
      },
    };
  },

  // Remove a manual SSH connection
  remove_connection: async (client, args, ctx) => {
    const { name } = removeConnectionSchema.parse(args);

    const config = loadConfig();
    const updated = removeConnectionFromConfig(config, name);

    if (!updated) {
      return {
        success: false,
        message: `Connection '${name}' not found in config file. Only manually added connections can be removed.`,
      };
    }

    // Reload all connections
    if (ctx?.reloadConnections) {
      await ctx.reloadConnections();
    }

    return {
      success: true,
      message: `Connection '${name}' removed from ${getConfigPath()}`,
    };
  },

  // Refresh all connections (re-discover + reload)
  refresh_connections: async (_client, _args, ctx) => {
    if (ctx?.reloadConnections) {
      await ctx.reloadConnections();
    }

    const connections = ctx?.sshManager.listConnections() ?? [];
    return {
      success: true,
      connections,
      count: connections.length,
      message: `Refreshed connections. ${connections.length} connection(s) available.`,
    };
  },

  // Show current config (redacted)
  get_config: async () => {
    const config = loadConfig();
    return {
      configPath: getConfigPath(),
      config: redactConfig(config),
    };
  },
};
