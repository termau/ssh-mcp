/**
 * BinaryLane auto-discovery.
 *
 * Fetches active servers from the BinaryLane API and returns
 * SSH connection configs for each.
 */

import { SSHConnection } from './ssh-client.js';

interface BLNetwork {
  ip_address: string;
  type: string;
}

interface BLServer {
  id: number;
  name: string;
  status: string;
  networks: {
    v4: BLNetwork[];
  };
}

interface BLResponse {
  servers: BLServer[];
  links?: {
    pages?: {
      next?: string;
    };
  };
}

/**
 * Discover active BinaryLane servers and return SSH connection configs.
 */
export async function discoverBinaryLaneServers(
  apiToken: string,
  defaultUsername: string,
  defaultPrivateKeyPath?: string,
): Promise<SSHConnection[]> {
  const connections: SSHConnection[] = [];
  let url: string | null = 'https://api.binarylane.com.au/v2/servers?per_page=100';

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BinaryLane API error (${response.status}): ${text}`);
    }

    const data: BLResponse = await response.json();

    for (const server of data.servers) {
      // Only include active servers
      if (server.status !== 'active') continue;

      // Find the public IPv4 address
      const publicIp = server.networks.v4.find(n => n.type === 'public');
      if (!publicIp) continue;

      connections.push({
        name: server.name,
        host: publicIp.ip_address,
        port: 22,
        username: defaultUsername,
        privateKeyPath: defaultPrivateKeyPath,
        source: 'binarylane',
      });
    }

    url = data.links?.pages?.next ?? null;
  }

  return connections;
}
