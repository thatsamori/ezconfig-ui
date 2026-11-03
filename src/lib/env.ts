// Server-side only env config: the instance's settings (see .env.example)
const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';

export const env = {
  /** The platform's SQLite database file; startup migrates it. */
  databasePath: process.env.DATABASE_PATH || '',
  /** The address browsers use; requests that change data must come from its origin. */
  publicUrl,
  discordClientId: process.env.DISCORD_CLIENT_ID || '',
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  discordRedirectUrl: process.env.DISCORD_REDIRECT_URL || `${publicUrl.replace(/\/+$/, '')}/api/auth/discord/callback`,
  /** Platform operators: comma-separated Discord user ids. */
  operatorDiscordIds: (process.env.OPERATOR_DISCORD_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
} as const;
