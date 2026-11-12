'use client';

import Link from 'next/link';
import { AlertCircle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox, LoaderCircle, RotateCw } from 'lucide-react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { ApiError } from '@/services/api-client';
import type { Page } from '@/types/api';
import { cn, label } from '@/lib/utils';
import { Button } from './ui/button';

export function Heading({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="heading-actions">{actions}</div>}</header>;
}

export function Panel({ title, description, action, children, className }: {
  title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={cn('panel', className)}>
    {(title || action) && <div className="panel-heading"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{action}</div>}
    {children}
  </section>;
}

export function Badge({ value, text }: { value: string; text?: string }) {
  return <span className={cn('badge', 'badge-' + value)}><span className="badge-dot" />{text ?? label(value)}</span>;
}

export function Failure({ error, retry }: { error: unknown; retry?: () => void }) {
  const api = error instanceof ApiError ? error : undefined;
  return <div className="feedback error-feedback" role="alert">
    <AlertCircle size={19} />
    <div><strong>{api?.status === 403 ? 'Access restricted' : api?.status === 404 ? 'Resource unavailable' : 'Unable to complete this request'}</strong>
      <p>{api?.message ?? 'Something went wrong. Please try again.'}</p>
      {api?.retryAfter && <p>Retry in {api.retryAfter} seconds.</p>}
      {api?.requestId && <small>Request {api.requestId}</small>}
    </div>
    {retry && <Button variant="outline" size="sm" onClick={retry}>Retry</Button>}
  </div>;
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return <div className="skeleton-wrap" role="status" aria-label="Loading"><span className="sr-only">Loading</span>
    {Array.from({ length: rows }, (_, i) => <div className="skeleton" key={i} />)}</div>;
}

export function Empty({ title = 'No records found', description }: { title?: string; description?: string }) {
  return <div className="empty"><span><Inbox size={21} /></span><strong>{title}</strong>{description && <p>{description}</p>}</div>;
}

export function Resource<T>({ query, children }: {
  query: { data?: T; isPending: boolean; error: unknown; refetch: () => unknown };
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <Loading />;
  if (query.error) return <Failure error={query.error} retry={() => void query.refetch()} />;
  return query.data === undefined ? <Empty /> : children(query.data);
}

export function Table<T>({ columns, rows, empty, onSort, sorting }: {
  columns: ColumnDef<T>[]; rows: T[]; empty?: string; onSort?: (id: string) => void;
  sorting?: { id: string; desc: boolean };
}) {
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), manualSorting: true, manualPagination: true });
  if (!rows.length) return <Empty title={empty} />;
  return <div className="table-scroll"><table className="data-table">
    <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th scope="col" key={header.id}>
      {onSort && header.column.getCanSort() ? <button className="sort-header" onClick={() => onSort(header.column.id)}>
        {flexRender(header.column.columnDef.header, header.getContext())}
        {sorting?.id === header.column.id && (sorting.desc ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}
      </button> : flexRender(header.column.columnDef.header, header.getContext())}
    </th>)}</tr>)}</thead>
    <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </td>)}</tr>)}</tbody>
  </table></div>;
}

export function Pager({ data, change }: { data: Pick<Page<unknown>, 'page' | 'page_size' | 'total' | 'has_previous' | 'has_next'>; change: (page: number) => void }) {
  const first = data.total ? Math.min(data.total, (data.page - 1) * data.page_size + 1) : 0;
  const last = Math.min(data.total, data.page * data.page_size);
  return <div className="pager"><span>{first}–{last} of {data.total.toLocaleString('en-IN')}</span>
    <div><Button variant="outline" size="icon" disabled={!data.has_previous} onClick={() => change(data.page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></Button>
      <span>Page {data.page}</span>
      <Button variant="outline" size="icon" disabled={!data.has_next} onClick={() => change(data.page + 1)} aria-label="Next page"><ChevronRight size={16} /></Button></div>
  </div>;
}

export function Refresh({ run, busy }: { run: () => void; busy?: boolean }) {
  const Icon = busy ? LoaderCircle : RotateCw;
  return <Button variant="outline" onClick={run} disabled={busy}><Icon size={15} className={busy ? 'animate-spin' : ''} />Refresh</Button>;
}

export function Details({ items }: { items: [string, ReactNode][] }) {
  return <dl className="detail-list">{items.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? '—'}</dd></div>)}</dl>;
}

export function RecordLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="record-link" href={href}>{children}</Link>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

