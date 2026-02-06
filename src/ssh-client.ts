/**
 * SSH Client wrapper for managing SSH connections
 */

import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface SSHConnection {
  name: string;
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
  source?: 'config' | 'env' | 'binarylane';
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * SSH Client Manager
 *
 * Manages SSH connections defined via environment variables or config.
 * Connections are defined as JSON in SSH_CONNECTIONS env var:
 *
 * SSH_CONNECTIONS='[
 *   {"name": "web1", "host": "192.168.1.10", "port": 22, "username": "root", "privateKeyPath": "~/.ssh/id_rsa"},
 *   {"name": "db1", "host": "192.168.1.11", "port": 22, "username": "admin", "password": "secret"}
 * ]'
 */
export class SSHClientManager {
  private connections: Map<string, SSHConnection> = new Map();

  constructor() {}

  /**
   * Load connections from multiple sources.
   * Priority: config (manual) > env var > auto-discovered (binarylane)
   * Lower-priority sources don't overwrite higher-priority ones with the same name.
   */
  loadConnections(sources: SSHConnection[][]): void {
    this.connections.clear();

    // Sources are passed in priority order (highest first).
    // First source to claim a name wins.
    for (const connectionList of sources) {
      for (const conn of connectionList) {
        if (!conn.name || !conn.host || !conn.username) {
          console.error(`Invalid connection config: ${JSON.stringify(conn)}`);
          continue;
        }

        // Don't overwrite higher-priority connections
        if (this.connections.has(conn.name)) continue;

        // Expand ~ in privateKeyPath
        if (conn.privateKeyPath) {
          conn.privateKeyPath = conn.privateKeyPath.replace(/^~/, homedir());
        }

        // Default port
        conn.port = conn.port || 22;

        this.connections.set(conn.name, conn);
      }
    }

    console.error(`Loaded ${this.connections.size} SSH connections`);
  }

  /**
   * Load connections from SSH_CONNECTIONS environment variable.
   * Returns the parsed connections with source='env'.
   */
  static loadFromEnv(): SSHConnection[] {
    const connectionsJson = process.env.SSH_CONNECTIONS;
    if (!connectionsJson) return [];

    try {
      const connections: SSHConnection[] = JSON.parse(connectionsJson);
      return connections.map(c => ({ ...c, source: 'env' as const }));
    } catch (error) {
      console.error(`Failed to parse SSH_CONNECTIONS: ${error}`);
      return [];
    }
  }

  /**
   * Add a connection at runtime (does not persist - use config.ts for persistence).
   */
  addConnection(conn: SSHConnection): void {
    if (conn.privateKeyPath) {
      conn.privateKeyPath = conn.privateKeyPath.replace(/^~/, homedir());
    }
    conn.port = conn.port || 22;
    this.connections.set(conn.name, conn);
  }

  /**
   * Remove a connection by name.
   */
  removeConnection(name: string): boolean {
    return this.connections.delete(name);
  }

  /**
   * List all configured connections
   */
  listConnections(): { name: string; host: string; port: number; username: string; source?: string }[] {
    return Array.from(this.connections.values()).map(conn => ({
      name: conn.name,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      source: conn.source,
    }));
  }

  /**
   * Get a connection by name
   */
  getConnection(name: string): SSHConnection | undefined {
    return this.connections.get(name);
  }

  /**
   * Create SSH connect config from connection definition
   */
  private getConnectConfig(conn: SSHConnection): ConnectConfig {
    const config: ConnectConfig = {
      host: conn.host,
      port: conn.port,
      username: conn.username,
    };

    if (conn.privateKeyPath) {
      if (!existsSync(conn.privateKeyPath)) {
        throw new Error(`Private key not found: ${conn.privateKeyPath}`);
      }
      config.privateKey = readFileSync(conn.privateKeyPath);
    } else if (conn.password) {
      config.password = conn.password;
    } else {
      // Try default SSH key locations
      const defaultKeys = [
        join(homedir(), '.ssh', 'id_ed25519'),
        join(homedir(), '.ssh', 'id_rsa'),
      ];

      for (const keyPath of defaultKeys) {
        if (existsSync(keyPath)) {
          config.privateKey = readFileSync(keyPath);
          break;
        }
      }

      if (!config.privateKey) {
        throw new Error('No authentication method available. Provide privateKeyPath or password.');
      }
    }

    return config;
  }

  /**
   * Execute a command on a remote server
   */
  async runCommand(connectionName: string, command: string, timeout: number = 30000): Promise<CommandResult> {
    const conn = this.getConnection(connectionName);
    if (!conn) {
      throw new Error(`Unknown connection: ${connectionName}. Use list_connections to see available connections.`);
    }

    return new Promise((resolve, reject) => {
      const client = new Client();
      let stdout = '';
      let stderr = '';

      const timeoutId = setTimeout(() => {
        client.end();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      client.on('ready', () => {
        client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeoutId);
            client.end();
            reject(err);
            return;
          }

          stream.on('close', (code: number) => {
            clearTimeout(timeoutId);
            client.end();
            resolve({ stdout, stderr, code: code || 0 });
          });

          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });

      try {
        const config = this.getConnectConfig(conn);
        client.connect(config);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Upload a file to a remote server
   */
  async uploadFile(
    connectionName: string,
    localPath: string,
    remotePath: string
  ): Promise<{ success: boolean; message: string }> {
    const conn = this.getConnection(connectionName);
    if (!conn) {
      throw new Error(`Unknown connection: ${connectionName}`);
    }

    if (!existsSync(localPath)) {
      throw new Error(`Local file not found: ${localPath}`);
    }

    return new Promise((resolve, reject) => {
      const client = new Client();

      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          sftp.fastPut(localPath, remotePath, (err) => {
            client.end();
            if (err) {
              reject(err);
            } else {
              resolve({ success: true, message: `Uploaded ${localPath} to ${remotePath}` });
            }
          });
        });
      });

      client.on('error', reject);

      try {
        const config = this.getConnectConfig(conn);
        client.connect(config);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Download a file from a remote server
   */
  async downloadFile(
    connectionName: string,
    remotePath: string,
    localPath: string
  ): Promise<{ success: boolean; message: string }> {
    const conn = this.getConnection(connectionName);
    if (!conn) {
      throw new Error(`Unknown connection: ${connectionName}`);
    }

    return new Promise((resolve, reject) => {
      const client = new Client();

      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          sftp.fastGet(remotePath, localPath, (err) => {
            client.end();
            if (err) {
              reject(err);
            } else {
              resolve({ success: true, message: `Downloaded ${remotePath} to ${localPath}` });
            }
          });
        });
      });

      client.on('error', reject);

      try {
        const config = this.getConnectConfig(conn);
        client.connect(config);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Read a file from a remote server
   */
  async readFile(connectionName: string, remotePath: string): Promise<string> {
    const conn = this.getConnection(connectionName);
    if (!conn) {
      throw new Error(`Unknown connection: ${connectionName}`);
    }

    return new Promise((resolve, reject) => {
      const client = new Client();

      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          let content = '';
          const readStream = sftp.createReadStream(remotePath);

          readStream.on('data', (chunk: Buffer) => {
            content += chunk.toString();
          });

          readStream.on('end', () => {
            client.end();
            resolve(content);
          });

          readStream.on('error', (err: Error) => {
            client.end();
            reject(err);
          });
        });
      });

      client.on('error', reject);

      try {
        const config = this.getConnectConfig(conn);
        client.connect(config);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * List directory contents on a remote server
   */
  async listDirectory(connectionName: string, remotePath: string): Promise<{
    name: string;
    type: string;
    size: number;
    modifyTime: Date;
  }[]> {
    const conn = this.getConnection(connectionName);
    if (!conn) {
      throw new Error(`Unknown connection: ${connectionName}`);
    }

    return new Promise((resolve, reject) => {
      const client = new Client();

      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          sftp.readdir(remotePath, (err, list) => {
            client.end();
            if (err) {
              reject(err);
            } else {
              resolve(list.map(item => ({
                name: item.filename,
                type: item.attrs.isDirectory() ? 'directory' : item.attrs.isFile() ? 'file' : 'other',
                size: item.attrs.size,
                modifyTime: new Date(item.attrs.mtime * 1000),
              })));
            }
          });
        });
      });

      client.on('error', reject);

      try {
        const config = this.getConnectConfig(conn);
        client.connect(config);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Test connection to a server
   */
  async testConnection(connectionName: string): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const conn = this.getConnection(connectionName);
    if (!conn) {
      throw new Error(`Unknown connection: ${connectionName}`);
    }

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const client = new Client();

      const timeout = setTimeout(() => {
        client.end();
        resolve({ success: false, message: 'Connection timed out' });
      }, 10000);

      client.on('ready', () => {
        clearTimeout(timeout);
        const latencyMs = Date.now() - startTime;
        client.end();
        resolve({
          success: true,
          message: `Connected successfully to ${conn.host}:${conn.port}`,
          latencyMs
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, message: `Connection failed: ${err.message}` });
      });

      try {
        const config = this.getConnectConfig(conn);
        client.connect(config);
      } catch (error) {
        clearTimeout(timeout);
        resolve({ success: false, message: `Configuration error: ${(error as Error).message}` });
      }
    });
  }
}
