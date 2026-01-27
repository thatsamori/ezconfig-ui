// Server-side only env config
export const env = {
  rcon: {
    host: process.env.RCON_HOST || 'localhost',
    port: parseInt(process.env.RCON_PORT || '27015', 10),
    password: process.env.RCON_PASSWORD || '',
  },
  databasesPath: process.env.DATABASES_PATH || './Databases',
  presetsPath: process.env.PRESETS_PATH || './Presets',
  ezconfigPassword: process.env.EZCONFIG_PASSWORD || '',
  // Auth settings
  usersPath: process.env.USERS_PATH || './users.json',
  adminUsername: process.env.ADMIN_USERNAME || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
} as const;

// Validation - call this in server actions
export function validateEnv() {
  if (!process.env.RCON_PASSWORD) {
    throw new Error('RCON_PASSWORD environment variable is required');
  }
}
