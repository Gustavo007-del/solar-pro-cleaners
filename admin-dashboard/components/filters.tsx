'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { Field } from './shared';

export function useDebounced(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return debounced;
}

export function SelectFilter({ label, value, onChange, choices, all }: {
  label: string; value: string; onChange: (value: string) => void; choices: { value: string; label: string }[]; all?: string;
}) {
  return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)}>
    {all !== undefined && <option value="">{all}</option>}
    {choices.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
  </select></Field>;
}

export function TextFilter({ label, value, onChange, type = 'text', placeholder, className }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; className?: string;
}) {
  return <div className={className}><Field label={label}><input type={type} value={value} maxLength={120}
    placeholder={placeholder} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)} /></Field></div>;
}

