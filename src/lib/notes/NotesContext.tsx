"use client";

import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from "react";
import type { NotesData } from "./types";

interface NotesContextValue {
  /** Get notes for a schema (uses cache, fetches if not cached) */
  getNotes: (schema: string) => Promise<NotesData>;
  /** Get cached notes synchronously (returns empty object if not cached) */
  getCachedNotes: (schema: string) => NotesData;
  /** Invalidate cache and fetch fresh data */
  invalidateAndRefetch: (schema: string) => Promise<NotesData>;
  /** Check if schema is currently loading */
  isLoading: (schema: string) => boolean;
  /** Subscribe to loading state changes */
  subscribeToLoading: (callback: () => void) => () => void;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
  // Use refs for synchronous access (prevents race conditions)
  const cacheRef = useRef<Record<string, NotesData>>({});
  const inFlightRef = useRef<Record<string, Promise<NotesData>>>({});
  const loadingRef = useRef<Record<string, boolean>>({});

  // State only for triggering re-renders when loading changes
  const [, setLoadingVersion] = useState(0);
  const subscribersRef = useRef<Set<() => void>>(new Set());

  const notifySubscribers = useCallback(() => {
    setLoadingVersion((v) => v + 1);
    subscribersRef.current.forEach((cb) => cb());
  }, []);

  const subscribeToLoading = useCallback((callback: () => void) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  const isLoading = useCallback((schema: string) => {
    return loadingRef.current[schema] ?? false;
  }, []);

  const getCachedNotes = useCallback((schema: string): NotesData => {
    return cacheRef.current[schema] || {};
  }, []);

  const fetchFromServer = useCallback(async (schema: string): Promise<NotesData> => {
    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(schema)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          return data.data || {};
        }
      }
    } catch {
      // Ignore fetch errors
    }
    return {};
  }, []);

  const getNotes = useCallback(async (schema: string): Promise<NotesData> => {
    // Return cached data if available
    if (schema in cacheRef.current) {
      return cacheRef.current[schema];
    }

    // If there's already a request in flight, return that promise
    if (schema in inFlightRef.current) {
      return inFlightRef.current[schema];
    }

    // Start a new request
    loadingRef.current[schema] = true;
    notifySubscribers();

    const requestPromise = (async () => {
      try {
        const notesData = await fetchFromServer(schema);
        cacheRef.current[schema] = notesData;
        return notesData;
      } finally {
        delete inFlightRef.current[schema];
        loadingRef.current[schema] = false;
        notifySubscribers();
      }
    })();

    inFlightRef.current[schema] = requestPromise;
    return requestPromise;
  }, [fetchFromServer, notifySubscribers]);

  const invalidateAndRefetch = useCallback(async (schema: string): Promise<NotesData> => {
    // Fetch fresh data from server
    const notesData = await fetchFromServer(schema);
    // Update cache
    cacheRef.current[schema] = notesData;
    notifySubscribers();
    return notesData;
  }, [fetchFromServer, notifySubscribers]);

  return (
    <NotesContext.Provider value={{
      getNotes,
      getCachedNotes,
      invalidateAndRefetch,
      isLoading,
      subscribeToLoading
    }}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotesContext() {
  const context = useContext(NotesContext);
  if (!context) {
    throw new Error("useNotesContext must be used within a NotesProvider");
  }
  return context;
}
