'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { queryPath, request, type Options, type QueryParams } from '@/services/api-client';
import { adminRequest } from '@/services/auth';

export function useApi<T>(path: string, params: QueryParams = {}, enabled = true) {
  const url = queryPath(path, params);
  return useQuery({
    queryKey: ['api', path, url],
    queryFn: ({ signal }) => path.startsWith('/admin/') ? adminRequest<T>(url, { signal }) : request<T>(url, { signal }),
    enabled,
  });
}

export function useAction() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: NonNullable<Options['method']>; body?: object }) =>
      adminRequest(path, { method, body }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['api'] }),
  });
}

export function useFilters(defaults: Record<string, string> = {}) {
  const [values, setValues] = useState(defaults);
  const [page, setPage] = useState(1);
  const set = useCallback((name: string, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setPage(1);
  }, []);
  return { values, page, set, setPage, clear: () => { setValues(defaults); setPage(1); } };
}

