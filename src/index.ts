#!/usr/bin/env node

/**
 * SSH MCP Server
 *
 * A Model Context Protocol server for executing commands on remote servers via SSH.
 * Provides tools for running commands, reading files, and transferring files.
 *
 * Connection sources (in priority order):
 *   1. Manual config file (~/.config/ssh-mcp/connections.json)
 *   2. SSH_CONNECTIONS environment variable
 *   3. BinaryLane auto-discovery (if enabled in config)
 *
 * Environment Variables:
 *   SSH_CONNECTIONS - Optional. JSON array of connection configurations.
 *   BINARYLANE_API_TOKEN - Optional. Enables auto-discovery of BinaryLane servers.
 *                          Can also be set in the config file.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';

import { SSHClientManager } from './ssh-client.js';
import { allTools } from './tools.js';
import { allHandlers, type HandlerContext } from './handlers.js';
import { loadConfig, getConfigPath } from './config.js';
import { discoverBinaryLaneServers } from './binarylane.js';

// ==================== Configuration ====================

const SERVER_NAME = 'ssh-mcp';
const SERVER_VERSION = '1.0.0';

// Initialize SSH client manager
const sshManager = new SSHClientManager();

// ==================== Connection Loading ====================

/**
 * Load and merge connections from all sources.
 */
async function reloadConnections(): Promise<void> {
  const config = loadConfig();

  // Source 1 (highest priority): Manual connections from config file
  const configConnections = config.connections.map(c => ({
    ...c,
    port: c.port || 22,
    source: 'config' as const,
  }));

  // Source 2: SSH_CONNECTIONS env var
  const envConnections = SSHClientManager.loadFromEnv();

  // Source 3 (lowest priority): BinaryLane auto-discovery
  let blConnections: Awaited<ReturnType<typeof discoverBinaryLaneServers>> = [];
  const blToken = config.binarylane.apiToken || process.env.BINARYLANE_API_TOKEN;

  if (config.binarylane.enabled && blToken) {
    try {
      blConnections = await discoverBinaryLaneServers(
        blToken,
        config.binarylane.defaultUsername,
        config.binarylane.defaultPrivateKeyPath,
      );
      console.error(`Auto-discovered ${blConnections.length} BinaryLane server(s)`);
    } catch (error) {
      console.error(`BinaryLane auto-discovery failed: ${error}`);
    }
  }

  // Load with priority: config > env > binarylane
  sshManager.loadConnections([configConnections, envConnections, blConnections]);
}

// Handler context for tools that need reload access
const handlerContext: HandlerContext = {
  sshManager,
  reloadConnections,
};

// ==================== Error Handling ====================

/**
 * Format errors into actionable messages for LLM consumption.
 */
function formatError(error: unknown): string {
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const issues = error.issues.map(issue => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    }).join('; ');
    return `Validation error: ${issues}. Please check the parameter values and try again.`;
  }

  // Handle SSH-specific errors
  if (error instanceof Error) {
    const message = error.message;

    // Provide actionable suggestions based on common errors
    if (message.includes('ECONNREFUSED')) {
      return 'Connection refused. Check that the server is running and the port is correct.';
    }
    if (message.includes('ETIMEDOUT') || message.includes('timed out')) {
      return 'Connection timed out. Check that the server is reachable and not blocked by firewall.';
    }
    if (message.includes('Authentication failed') || message.includes('All configured authentication methods failed')) {
      return 'Authentication failed. Check your SSH key or password configuration.';
    }
    if (message.includes('ENOTFOUND')) {
      return 'Host not found. Check the hostname or IP address.';
    }
    if (message.includes('Permission denied')) {
      return 'Permission denied. Check file permissions or user privileges on the remote server.';
    }
    if (message.includes('No such file')) {
      return 'File or directory not found on the remote server.';
    }
    if (message.includes('Unknown connection')) {
      return `${message}. Use list_connections to see available connections.`;
    }

    return `Error: ${message}`;
  }

  return `Unexpected error: ${String(error)}`;
}

// ==================== Server Setup ====================

const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ==================== Tool Registration ====================

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: allTools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Find the handler for this tool
  const handler = allHandlers[name];

  if (!handler) {
    return {
      content: [{
        type: 'text',
        text: `Unknown tool: ${name}. Use list_tools to see available tools.`,
      }],
      isError: true,
    };
  }

  try {
    // Execute the handler with context
    const result = await handler(sshManager, args || {}, handlerContext);

    // Return formatted result
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (error) {
    // Return actionable error message
    return {
      content: [{
        type: 'text',
        text: formatError(error),
      }],
      isError: true,
    };
  }
});

// ==================== Server Startup ====================

async function main() {
  console.error(`${SERVER_NAME} v${SERVER_VERSION} starting...`);
  console.error(`Config: ${getConfigPath()}`);

  // Load connections from all sources
  await reloadConnections();

  const connections = sshManager.listConnections();
  if (connections.length > 0) {
    console.error(`Available connections:`);
    for (const c of connections) {
      console.error(`  - ${c.name} (${c.host}:${c.port}) [${c.source ?? 'unknown'}]`);
    }
  } else {
    console.error('No SSH connections found.');
    console.error('Add connections via: add_connection tool, config file, SSH_CONNECTIONS env var, or BinaryLane auto-discovery.');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Ready to accept requests');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
