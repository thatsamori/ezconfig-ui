'use client';

import { Logo } from '@/components/Logo';

// What the Discord callback reports back in `?sign-in=`.
const outcomes: Record<string, string> = {
  'invite-only': 'EZConfig is invite-only. Ask the platform operator for an invite link, then sign in from it.',
  'access-removed': 'Your access to EZConfig has been removed. Ask the platform operator if you think this is a mistake.',
  cancelled: 'Sign-in was cancelled on Discord.',
  failed: 'Could not sign in with Discord. Try again.',
};

export function SignInPage({ outcome }: { outcome?: string }) {
  const message = outcome ? outcomes[outcome] : undefined;
  return <main className="login-screen"><div className="login-column"><header><Logo /><h1>Sign in to EZConfig</h1><p>Mordhau server console</p></header>{message && <p className="sign-in-outcome" role="alert">{message}</p>}<a className="primary-button discord-button" href="/api/auth/discord">Sign in with Discord</a><p>EZConfig is invite-only. Discord only tells it your account id, name and avatar.</p></div></main>;
}
