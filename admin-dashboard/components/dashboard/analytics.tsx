'use client';

import { useState, type FormEvent } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, ChartNoAxesCombined } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Empty, Field, Panel, Resource } from '@/components/shared';
import { useApi } from '@/hooks/use-api';
import { routes } from '@/services/routes';
import { dateText, label } from '@/lib/utils';
import { statuses, type Analytics, type Counts } from '@/types/api';

export type DateRange = { start_date?: string; end_date?: string };
export const palette = ['#d09b4a', '#4c7eb9', '#8c6cbd', '#4697a6', '#34815d', '#c37d85'];

export function DateFilter({ change, limit = true }: { change: (range: DateRange) => void; limit?: boolean }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState('');
  function apply(event: FormEvent) {
    event.preventDefault();
    if (!start || !end || end < start) { setError('Choose an ordered start and end date.'); return; }
    if (limit && Date.parse(end) - Date.parse(start) >= 366 * 86_400_000) { setError('Use a range of 366 days or fewer.'); return; }
    setError('');
    change({ start_date: start, end_date: end });
  }
  return <form className="range-control" onSubmit={apply}>
    <div className="actions"><Field label="From"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <Field label="Through"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      <Button type="submit" variant="outline"><CalendarDays size={15} />Apply dates</Button>
      {(start || end) && <Button variant="ghost" onClick={() => { setStart(''); setEnd(''); setError(''); change({}); }}>Reset</Button>}
    </div>
    {error && <span className="field-error" role="alert">{error}</span>}
  </form>;
}

export function StatusDistribution({ counts }: { counts: Counts }) {
  const total = statuses.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  return <div className="distribution">
    <div className="distribution-bar" aria-hidden="true">
      {total > 0 && statuses.map((key, index) => counts[key] > 0 && <span key={key}
        style={{ flex: counts[key], background: palette[index] }} />)}
    </div>
    <dl>{statuses.map((status) => <div key={status}><dt><Badge value={status} /></dt><dd>{counts[status] ?? 0}</dd></div>)}</dl>
  </div>;
}

export function Trends({ range, report = false }: { range: DateRange; report?: boolean }) {
  const [interval, setInterval] = useState<'day' | 'week' | 'month'>(report ? 'month' : 'week');
  const query = useApi<Analytics>(routes.analytics, { ...range, interval });
  return <div className="wide-split">
    <Panel title="Booking trends" action={<div className="segment-control" aria-label="Trend interval">
      {(['day', 'week', 'month'] as const).map((value) => <button key={value} aria-pressed={interval === value}
        className={interval === value ? 'selected' : ''} onClick={() => setInterval(value)}>{label(value)}</button>)}
    </div>}>
      <Resource query={query}>{(data) => <div className="panel-body">
        <p className="muted small">{dateText(data.reporting_period.start_date)} – {dateText(data.reporting_period.end_date)} · {data.timezone}</p>
        {data.points.every((item) => item.total === 0) ? <Empty title="No bookings in this period" /> :
          <div className="chart" role="img" aria-label="Booking volume, completion and cancellation over time">
            <ResponsiveContainer width="100%" height={256}>
              <AreaChart data={data.points} margin={{ top: 14, right: 10, bottom: 0, left: -15 }}>
                <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#63b28e" stopOpacity={.42} /><stop offset="100%" stopColor="#63b28e" stopOpacity={.04} />
                </linearGradient></defs>
                <CartesianGrid vertical={false} stroke="#e8efea" strokeDasharray="3 4" />
                <XAxis dataKey="period_start" tickFormatter={(date) => dateText(date).split(' ').slice(0, 2).join(' ')}
                  tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#556c60' }} minTickGap={18} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#556c60' }} />
                <Tooltip labelFormatter={(date) => dateText(String(date))} /><Legend iconSize={9} />
                <Area dataKey="total" name="Bookings" type="monotone" stroke="#1c7b56" strokeWidth={2.3} fill="url(#trendFill)" />
                <Area dataKey="completed" name="Completed" type="monotone" stroke="#4982bd" strokeWidth={1.6} fill="transparent" />
                <Area dataKey="cancelled" name="Cancelled" type="monotone" stroke="#ba6773" strokeWidth={1.6} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>}
      </div>}</Resource>
    </Panel>
    <Panel title="Booking status" action={<ChartNoAxesCombined size={18} className="panel-icon" />}>
      <Resource query={query}>{(data) => <div className="panel-body"><StatusDistribution counts={data.status_distribution} /></div>}</Resource>
    </Panel>
  </div>;
}

