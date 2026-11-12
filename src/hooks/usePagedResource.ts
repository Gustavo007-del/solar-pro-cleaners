import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

type Page<T> = { items: T[]; has_next: boolean; page: number };
type Snapshot<T, P> = { items: T[]; first: P; page: number; hasNext: boolean; read: (page: number) => Promise<P> };

export function usePagedResource<T, P extends Page<T>>(read: (page: number) => Promise<P>) {
  const [snapshot, setData] = useState<Snapshot<T, P>>();
  const data = snapshot?.read === read ? snapshot : undefined;
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const version = useRef(0);
  const request = useRef(false);

  const refresh = useCallback(async () => {
    const current = ++version.current;
    request.current = false;
    setMore(false);
    setLoading(true);
    setError(undefined);
    try {
      const page = await read(1);
      if (current === version.current) setData({ items: page.items, first: page, page: page.page, hasNext: page.has_next, read });
    } catch (failure) {
      if (current === version.current) { setData(undefined); setError(failure); }
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, [read]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { version.current++; request.current = false; };
  }, [refresh]));

  async function loadMore() {
    if (!data?.hasNext || loading || request.current) return;
    request.current = true;
    setMore(true);
    setError(undefined);
    const current = version.current;
    try {
      const next = await read(data.page + 1);
      if (current === version.current) setData({ ...data, items: [...data.items, ...next.items], page: next.page, hasNext: next.has_next });
    } catch (failure) {
      if (current === version.current) setError(failure);
    } finally {
      if (current === version.current) { request.current = false; setMore(false); }
    }
  }
  return { data, error, loading, more, refresh, loadMore };
}

