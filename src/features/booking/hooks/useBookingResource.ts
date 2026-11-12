import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

type Snapshot<T> = { key: string; data?: T; loading: boolean; failed: boolean; error?: unknown };

export function useBookingResource<T>(key: string | undefined, read: () => Promise<T>) {
  const [snapshot, setSnapshot] = useState<Snapshot<T>>();
  const [revision, setRevision] = useState(0);
  const current = snapshot?.key === key ? snapshot : undefined;

  useFocusEffect(useCallback(() => {
    if (!key) return;
    let active = true;

    setSnapshot((previous) => ({
      key,
      data: previous?.key === key ? previous.data : undefined,
      loading: true,
      failed: false,
    }));

    void read().then(
      (data) => { if (active) setSnapshot({ key, data, loading: false, failed: false }); },
      (error: unknown) => {
        if (active) {
          setSnapshot((previous) => ({
            key,
            data: previous?.key === key ? previous.data : undefined,
            loading: false,
            failed: true,
            error,
          }));
        }
      },
    );

    return () => { active = false; };
  }, [key, read, revision]));

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  return {
    data: current?.data,
    loading: Boolean(key) && (current?.loading ?? true),
    failed: current?.failed ?? false,
    error: current?.error,
    refresh,
  };
}
