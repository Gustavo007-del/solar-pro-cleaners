'use client';

import { useState, type ChangeEvent } from 'react';
import { Failure, Field, Heading, Panel } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useAction } from '@/hooks/use-api';

const fields = ['name', 'phone', 'alternate_phone', 'whatsapp', 'email', 'location', 'district', 'state', 'postal_code',
  'latitude', 'longitude', 'installation_date', 'capacity_kw', 'panel_type', 'panel_count', 'installer', 'source', 'priority'];
type Sheet = { headers: string[]; rows: string[][] };
type Summary = { total: number; imported: number; skipped: number; rows: {
  row: number; status: string; message?: string; duplicate?: boolean; requires_review?: boolean;
}[] };

export function LeadImport() {
  const [sheet, setSheet] = useState<Sheet>();
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [allow, setAllow] = useState(false);
  const [review, setReview] = useState<Summary>();
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const action = useAction();

  async function load(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSheet(undefined); setReview(undefined); setFinished(false); setError(''); setReading(true);
    try {
      if (file.size > 512_000) throw new Error('Use a file under 500 KB.');
      let records: string[][];
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import('read-excel-file/browser');
        const rows = await readSheet(file, 1);
        records = rows.map((row) => row.map((cell) => cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? '')));
      } else if (/\.csv$/i.test(file.name)) {
        const { default: papa } = await import('papaparse');
        const parsed = papa.parse<string[]>(await file.text(), { skipEmptyLines: 'greedy' });
        if (parsed.errors.some((issue) => issue.type === 'Quotes')) throw new Error('Check the quotation marks in your CSV file.');
        records = parsed.data;
      } else throw new Error('Choose a CSV or XLSX file.');
      const [headers, ...rows] = records;
      if (!headers?.length || !rows.length || rows.length > 100 || headers.length > 40) {
        throw new Error('Use one header row, up to 40 columns, and 1–100 lead rows. Split larger lists.');
      }
      setMapping(Object.fromEntries(headers.map((header, index) => [index,
        fields.includes(header.trim().toLowerCase().replaceAll(' ', '_')) ? header.trim().toLowerCase().replaceAll(' ', '_') : ''])));
      setSheet({ headers, rows });
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not open the file.'); }
    finally { setReading(false); }
  }

  function run(confirm: boolean) {
    if (!sheet || finished) return;
    setError('');
    const columns = Object.entries(mapping).filter(([, field]) => field);
    if (!columns.length || new Set(columns.map(([, field]) => field)).size !== columns.length) {
      setError('Map at least one column and use each CRM field only once.');
      return;
    }
    const rows = sheet.rows.map((row) => Object.fromEntries(columns
      .map(([index, field]) => [field, row[Number(index)]?.trim() ?? ''] as const)
      .filter(([, value]) => value)));
    const body = { rows, allow_duplicates: allow };
    if (new TextEncoder().encode(JSON.stringify(body)).length > 60_000) {
      setError('Mapped data is too large. Import it in smaller batches.');
      return;
    }
    action.mutate({ path: '/admin/crm/import/' + (confirm ? 'confirm' : 'preview'), method: 'POST', body }, {
      onSuccess: (result) => { setReview(result as Summary); setFinished(confirm); },
    });
  }

  return <><Heading title="Import leads" description="Upload a CSV or XLSX file, map the columns, and review before saving." />
    <Panel title="Upload and map"><div className="panel-body grid gap-3">
      <Field label="Lead file"><input type="file" accept=".csv,.xlsx" onChange={(event) => void load(event)} disabled={reading || action.isPending} /></Field>
      <p className="muted">Use ISO dates (YYYY-MM-DD) in CSV and store phone numbers as text in Excel. Import up to 100 records at a time.</p>
      {sheet && <>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          {sheet.headers.map((header, index) => <Field key={index} label={header || `Column ${index + 1}`}>
            <select disabled={action.isPending || finished} value={mapping[index] ?? ''} onChange={(e) => {
              setMapping({ ...mapping, [index]: e.target.value }); setReview(undefined);
            }}><option value="">Skip this column</option>{fields.map((field) => <option value={field} key={field}>{field.replaceAll('_', ' ')}</option>)}</select>
          </Field>)}
        </div>
        <label><input type="checkbox" checked={allow} disabled={action.isPending || finished} onChange={(e) => {
          setAllow(e.target.checked); setReview(undefined);
        }} /> Import duplicate phone numbers as separate records</label>
        {error && <p role="alert">{error}</p>}
        {action.error && <Failure error={action.error} />}
        {!finished && <div className="heading-actions">
          <Button onClick={() => run(false)} disabled={action.isPending}>Validate and preview</Button>
          {review && review.skipped < review.total && <Button variant="outline" disabled={action.isPending}
            onClick={() => run(true)}>Confirm import</Button>}
        </div>}
      </>}
      {!sheet && error && <p role="alert">{error}</p>}
    </div></Panel>
    {sheet && review && <Panel title={finished ? 'Import results' : 'Review records'}>
      <div className="panel-body grid gap-2">
        <p>{review.total} total · {review.imported} imported · {review.skipped} skipped · {
          review.rows.filter((row) => row.status === 'duplicate' || row.duplicate).length} duplicates · {
          review.rows.filter((row) => row.status === 'invalid').length} invalid · {
          review.rows.filter((row) => row.requires_review).length} incomplete</p>
        <ol className="grid gap-2">{review.rows.map((row) => <li key={row.row} className="break-words">
          <strong>Row {row.row + 1}: {row.status}</strong>
          {row.message && <> · {row.message}</>}
          {row.duplicate && <> · duplicate</>}{row.requires_review && <> · incomplete</>}
          {!finished && <p className="muted">{sheet.rows[row.row - 1]?.filter(Boolean).join(' · ')}</p>}
        </li>)}</ol>
      </div>
    </Panel>}
  </>;
}
