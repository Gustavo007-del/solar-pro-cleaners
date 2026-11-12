'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field, Failure } from './shared';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';

export type Values = Record<string, string>;
export type Input = {
  name: string; label: string; type?: 'email' | 'password' | 'date' | 'time' | 'tel' | 'textarea' | 'select';
  options?: { value: string; label: string }[]; initial?: string; rule?: z.ZodType<string, string>;
  placeholder?: string; autoComplete?: string; required?: boolean;
};

export function options(values: readonly string[]) {
  return values.map((value) => ({ value, label: value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) }));
}

export function optional(value: string) { return value.trim() || null; }
export const phoneRule = z.string().trim().regex(/^(?:(?:\+91|0091|91)[ -]?)?[6-9](?:[ -]?[0-9]){9}$/, 'Enter an Indian mobile number.');
export const optionalPhone = z.union([z.literal(''), phoneRule]);
export const passwordRule = z.string().min(15, 'Use at least 15 characters.').max(128);
export const noteRule = z.string().trim().max(500, 'Use up to 500 characters.');

export function announce(message: string) {
  window.dispatchEvent(new CustomEvent('solar:notice', { detail: message }));
}

export function FormDialog({ title, description, fields, submit, close, submitLabel = 'Save changes', destructive, validate, extra, onValue }: {
  title: string; description?: string; fields: Input[]; submit: (values: Values) => Promise<unknown>;
  close: () => void; submitLabel?: string; destructive?: boolean;
  validate?: (values: Values) => string | undefined;
  extra?: ReactNode;
  onValue?: (field: string, value: string) => void;
}) {
  const schema = useMemo(() => z.record(z.string(), z.string()).superRefine((data, ctx) => {
    for (const field of fields) {
      const value = data[field.name] ?? '';
      if (field.required && !value.trim()) {
        ctx.addIssue({ code: 'custom', path: [field.name], message: 'This field is required.' });
        continue;
      }
      const result = field.rule?.safeParse(value);
      if (result && !result.success) ctx.addIssue({ code: 'custom', path: [field.name], message: result.error.issues[0].message });
    }
  }), [fields]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: Object.fromEntries(
    fields.map((field) => [field.name, field.initial ?? '']),
  ) });
  const { errors, isSubmitting } = form.formState;
  const submitForm = form.handleSubmit(async (values) => {
    const problem = validate?.(values);
    if (problem) { form.setError('root.validation', { message: problem }); return; }
    try {
      await submit(values);
      announce('Changes saved.');
      close();
    } catch (error) { form.setError('root.server', { message: error instanceof Error ? error.message : 'Please try again.' }); }
  });
  return <Modal title={title} description={description} open onOpenChange={(open) => { if (!open && !isSubmitting) close(); }}>
    <form onSubmit={submitForm} className="dialog-form" noValidate>
      {extra}
      {fields.map((field) => <Field label={field.label} key={field.name}>
        {field.type === 'textarea' ? <textarea rows={3} placeholder={field.placeholder} {...form.register(field.name)} />
          : field.type === 'select' ? <select {...form.register(field.name, {
            onChange: (event) => onValue?.(field.name, event.target.value),
          })}>
            {field.options?.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select> : <input type={field.type ?? 'text'} placeholder={field.placeholder}
            autoComplete={field.autoComplete} {...form.register(field.name)} />}
        {errors[field.name]?.message && <small className="field-error">{errors[field.name]?.message}</small>}
      </Field>)}
      {errors.root?.validation?.message && <p className="field-error" role="alert">{errors.root.validation.message}</p>}
      {errors.root?.server?.message && <p className="field-error" role="alert">{errors.root.server.message}</p>}
      <div className="dialog-actions"><Button variant="outline" onClick={close} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={isSubmitting}>
          {isSubmitting && <LoaderCircle className="animate-spin" size={16} />}{submitLabel}</Button></div>
    </form>
  </Modal>;
}

export { Failure };

