import { Rcon } from 'rcon-client';
import { env } from '@/lib/env';

export interface RconConfig {
  host: string;
  port: number;
  password: string;
}

/**
 * Execute a batch of RCON commands sequentially using a single connection
 * @param commands Array of command strings to execute
 * @returns Array of responses from each command
 */
export async function executeBatchCommands(commands: string[]): Promise<string[]> {
  const config: RconConfig = {
    host: env.rcon.host,
    port: env.rcon.port,
    password: env.rcon.password,
  };

  const rcon = await Rcon.connect(config);
  const responses: string[] = [];

  try {
    // Execute commands sequentially
    for (const command of commands) {
      const response = await rcon.send(command);
      responses.push(response);
      // Small delay between commands to avoid overwhelming the server
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    await rcon.end();
  }

  return responses;
}

/**
 * Execute a single RCON command
 * @param command Command string to execute
 * @returns Response from the server
 */
export async function executeCommand(command: string): Promise<string> {
  const config: RconConfig = {
    host: env.rcon.host,
    port: env.rcon.port,
    password: env.rcon.password,
  };

  const rcon = await Rcon.connect(config);

  try {
    return await rcon.send(command);
  } finally {
    await rcon.end();
  }
}
