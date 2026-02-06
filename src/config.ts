/**
 * Persistent configuration for SSH MCP.
 *
 * Stores connections and settings in ~/.config/ssh-mcp/connections.json
 * so they survive across restarts.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

export interface BinaryLaneConfig {
  enabled: boolean;
  apiToken?: string;
  defaultUsername: string;
  defaultPrivateKeyPath?: string;
}

export interface ConnectionConfig {
  name: string;
  host: string;
  port?: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
}

export interface SSHMCPConfig {
  defaultPrivateKeyPath?: string;
  binarylane: BinaryLaneConfig;
  connections: ConnectionConfig[];
}

const DEFAULT_CONFIG: SSHMCPConfig = {
  defaultPrivateKeyPath: '~/.ssh/id_ed25519',
  binarylane: {
    enabled: true,
    defaultUsername: 'root',
    defaultPrivateKeyPath: '~/.ssh/id_ed25519',
  },
  connections: [],
};

export function getConfigDir(): string {
  return join(homedir(), '.config', 'ssh-mcp');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'connections.json');
}

/**
 * Load config from disk. Creates default config file if it doesn't exist.
 */
export function loadConfig(): SSHMCPConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SSHMCPConfig>;

    // Merge with defaults for any missing fields
    return {
      defaultPrivateKeyPath: parsed.defaultPrivateKeyPath ?? DEFAULT_CONFIG.defaultPrivateKeyPath,
      binarylane: {
        ...DEFAULT_CONFIG.binarylane,
        ...parsed.binarylane,
      },
      connections: parsed.connections ?? [],
    };
  } catch (error) {
    console.error(`Failed to load config from ${configPath}: ${error}`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save config to disk.
 */
export function saveConfig(config: SSHMCPConfig): void {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Add a connection to the config file. Replaces existing connection with same name.
 */
export function addConnectionToConfig(config: SSHMCPConfig, conn: ConnectionConfig): SSHMCPConfig {
  const updated = {
    ...config,
    connections: [
      ...config.connections.filter(c => c.name !== conn.name),
      conn,
    ],
  };
  saveConfig(updated);
  return updated;
}

/**
 * Remove a connection from the config file by name.
 * Returns null if connection was not found.
 */
export function removeConnectionFromConfig(config: SSHMCPConfig, name: string): SSHMCPConfig | null {
  const exists = config.connections.some(c => c.name === name);
  if (!exists) return null;

  const updated = {
    ...config,
    connections: config.connections.filter(c => c.name !== name),
  };
  saveConfig(updated);
  return updated;
}

/**
 * Return a redacted copy of the config (hide tokens and passwords).
 */
export function redactConfig(config: SSHMCPConfig): SSHMCPConfig {
  return {
    ...config,
    binarylane: {
      ...config.binarylane,
      apiToken: config.binarylane.apiToken ? '***' : undefined,
    },
    connections: config.connections.map(c => ({
      ...c,
      password: c.password ? '***' : undefined,
    })),
  };
}
