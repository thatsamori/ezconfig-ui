'use client';

import { useEffect, useState } from 'react';
import { useSessionStore } from '@/lib/store';
import { SignInPage } from './SignInPage';

interface AuthGateProps {
  children: React.ReactNode;
}

const SIGN_IN_OUTCOME = 'sign-in';

export function AuthGate({ children }: AuthGateProps) {
  const status = useSessionStore((state) => state.status);
  const load = useSessionStore((state) => state.load);
  // How the last sign-in went, from Discord's redirect back; nothing shows it until the session check ends.
  const [outcome] = useState(() => typeof window === 'undefined' ? undefined : new URL(window.location.href).searchParams.get(SIGN_IN_OUTCOME) ?? undefined);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has(SIGN_IN_OUTCOME)) {
      url.searchParams.delete(SIGN_IN_OUTCOME);
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    void load();
  }, [load]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (status === 'signed-out') {
    return <SignInPage outcome={outcome} />;
  }

  return <>{children}</>;
}
