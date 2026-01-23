// Server-side only env config
export const env = {
  rcon: {
    host: process.env.RCON_HOST || 'localhost',
    port: parseInt(process.env.RCON_PORT || '27015', 10),
    password: process.env.RCON_PASSWORD || '',
  },
  gameIniPath: process.env.GAME_INI_PATH || './Game.ini',
} as const;

// Validation - call this in server actions
export function validateEnv() {
  if (!process.env.RCON_PASSWORD) {
    throw new Error('RCON_PASSWORD environment variable is required');
  }
  if (!process.env.GAME_INI_PATH) {
    throw new Error('GAME_INI_PATH environment variable is required');
  }
}
