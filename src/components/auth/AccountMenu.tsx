'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSessionStore } from '@/lib/store';

/** The signed-in server owner's Discord avatar at the foot of the rail, with Sign out and Sign out everywhere. */
export function AccountMenu() {
  const user = useSessionStore(state => state.user);
  const signOut = useSessionStore(state => state.signOut);
  const signOutEverywhere = useSessionStore(state => state.signOutEverywhere);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!user) return null;
  const end = async (action: () => Promise<void>) => {
    setOpen(false);
    try {
      await action();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return <div className="account-menu" ref={menuRef}>
    <button className="rail-avatar" title={user.name} aria-label={`Account: ${user.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><span aria-hidden="true" style={{ backgroundImage: `url(${user.avatarUrl})` }} /></button>
    {open && <div className="account-popover" role="menu" aria-label="Account"><p><strong>{user.name}</strong>{user.operator && <span>Platform operator</span>}</p><button role="menuitem" onClick={() => end(signOut)}>Sign out</button><button role="menuitem" onClick={() => end(signOutEverywhere)}>Sign out everywhere</button></div>}
  </div>;
}
