import type { UserRole } from './types';

export function canEditConfig(role: UserRole | undefined): boolean {
  return role === 'config_editor' || role === 'global_admin';
}

export function canManagePresets(role: UserRole | undefined): boolean {
  return role === 'preset_creator' || role === 'config_editor' || role === 'global_admin';
}
