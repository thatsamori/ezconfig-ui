/**
 * Notes module - JSON file storage for config option annotations
 */

export * from './types';
export * from './service';
// NotesContext is exported separately to avoid bundling server code in client
// Import directly: import { NotesProvider } from '@/lib/notes/NotesContext'
