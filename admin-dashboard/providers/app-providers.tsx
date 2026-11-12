'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { auth } from '@/services/auth';
import { ApiError } from '@/services/api-client';

export function useSession() {
  return useSyncExternalStore(auth.subscribe, auth.snapshot, auth.initial);
}

export function usePermissions() {
  const session = useSession();
  const profile = session.state === 'active' ? session.value.profile : undefined;
  return { profile, can: (...permissions: string[]) => Boolean(profile && permissions.every((permission) => profile.permissions.includes(permission))) };
}

function SessionLifecycle() {
  const client = useQueryClient();
  useEffect(() => {
    const getOwner = () => {
      const state = auth.snapshot();
      return state.state === 'active'
        ? [state.value.profile.id, ...state.value.profile.permissions.toSorted()].join('|') : undefined;
    };
    let owner = getOwner();
    const stop = auth.subscribe(() => {
      const next = getOwner();
      if (owner !== next) { client.clear(); owner = next; }
    });
    void auth.restore();
    return stop;
  }, [client]);
  return null;
}

function Notice() {
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const receive = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      clearTimeout(timeout);
      setNotice(message);
      timeout = setTimeout(() => setNotice(''), 3200);
    };
    window.addEventListener('solar:notice', receive);
    return () => { window.removeEventListener('solar:notice', receive); clearTimeout(timeout); };
  }, []);
  return notice ? <div className="toast" role="status"><CircleCheck size={19} />{notice}</div> : null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true,
      retry: (count, error) => count === 0 && error instanceof ApiError && (error.status === 0 || error.status >= 500) } },
  }));
  return <QueryClientProvider client={client}><SessionLifecycle />{children}<Notice /></QueryClientProvider>;
}

