'use client';

import { useEffect, useState } from 'react';
import { useConfigStore } from '@/lib/store/configStore';
import { loadGameIniConfig } from '@/app/actions/gameini';

interface ConfigLoaderProps {
  children: React.ReactNode;
}

export function ConfigLoader({ children }: ConfigLoaderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initializeFromGameIni = useConfigStore((state) => state.initializeFromGameIni);

  useEffect(() => {
    async function loadConfig() {
      const result = await loadGameIniConfig();

      if (result.success) {
        initializeFromGameIni(result.data.characterValues, result.data.weaponValues);
        setError(null);
      } else {
        // Don't block UI on env config errors - just show warning
        console.warn('Failed to load Game.ini config:', result.error);
        setError(result.error);
      }

      setIsLoading(false);
    }

    loadConfig();
  }, [initializeFromGameIni]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading configuration...</p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="bg-destructive/15 text-destructive px-4 py-2 text-sm mb-4 rounded">
          {error}
        </div>
      )}
      {children}
    </>
  );
}
