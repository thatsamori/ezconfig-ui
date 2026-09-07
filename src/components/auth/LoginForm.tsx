'use client';

import { useState } from 'react';
import { Logo } from '@/components/Logo';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';
export function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore(state => state.login);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    try {
      if (!(await login(username, password))) toast.error('Invalid username or password');
    } catch {
      toast.error('Could not sign in. Try again.');
    } finally {
      setLoading(false);
    }
  };
  return <main className="login-screen"><div className="login-column"><header><Logo /><h1>Sign in to EZConfig</h1><p>{process.env.NEXT_PUBLIC_SERVER_NAME ? `${process.env.NEXT_PUBLIC_SERVER_NAME} · ` : ''}Mordhau server console</p></header><form onSubmit={submit}><label>Username<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} disabled={loading} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={loading} required /></label><button className="primary-button" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button></form><p>Accounts are created by an admin in Users. No self sign-up.</p></div></main>;
}
