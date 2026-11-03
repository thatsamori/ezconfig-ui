// Server-side only env config
const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';

export const env = {
  rcon: {
    host: process.env.RCON_HOST || 'localhost',
    port: parseInt(process.env.RCON_PORT || '27015', 10),
    password: process.env.RCON_PASSWORD || '',
  },
  databasesPath: process.env.DATABASES_PATH || './Databases',
  ezconfigPassword: process.env.EZCONFIG_PASSWORD || '',
  // Online platform (instance settings; see .env.example)
  databasePath: process.env.DATABASE_PATH || '',
  /** The address browsers use; requests that change data must come from its origin. */
  publicUrl,
  discordClientId: process.env.DISCORD_CLIENT_ID || '',
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  discordRedirectUrl: process.env.DISCORD_REDIRECT_URL || `${publicUrl.replace(/\/+$/, '')}/api/auth/discord/callback`,
  /** Platform operators: comma-separated Discord user ids. */
  operatorDiscordIds: (process.env.OPERATOR_DISCORD_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
} as const;

// Validation - call this in server actions
export function validateEnv() {
  if (!process.env.RCON_PASSWORD) {
    throw new Error('RCON_PASSWORD environment variable is required');
  }
}
