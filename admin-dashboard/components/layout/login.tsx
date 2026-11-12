'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { auth } from '@/services/auth';
import { useSession } from '@/providers/app-providers';
import { Button } from '@/components/ui/button';
import { Failure, Field } from '@/components/shared';

const schema = z.object({ email: z.email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.').max(128) });

export function Brand({ light = false }: { light?: boolean }) {
  return <div className={light ? 'brand brand-light' : 'brand'}><span className="brand-symbol"><Sun size={21} strokeWidth={2.2} /></span>
    <div><strong>Solar Care</strong><span>Operations Console</span></div></div>;
}

export function Login() {
  const router = useRouter();
  const session = useSession();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<unknown>();
  const { handleSubmit, register, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  useEffect(() => { if (session.state === 'active') router.replace('/dashboard'); }, [router, session]);
  const signIn = handleSubmit(async ({ email, password }) => {
    setError(undefined);
    try { await auth.login(email, password); router.replace('/dashboard'); }
    catch (error) { setError(error); }
  });
  return <main className="login-layout">
    <aside className="login-art" aria-hidden="true">
      <Brand light />
      <div className="solar-decoration"><div /><div /><div /><div /><div /><div /><div /><div /><div /></div>
      <div className="login-art-title"><p>Solar Care</p><strong>Service<br />operations</strong></div>
    </aside>
    <div className="login-main">
      <div className="login-mobile-brand"><Brand /></div>
      <section className="login-card">
        <div className="login-lock"><LockKeyhole size={23} /></div>
        <h1>Sign in</h1><p>Use your administrator account to access Solar Care.</p>
        {(error != null || session.state === 'unavailable') && <Failure error={error ?? (session.state === 'unavailable' ? session.error : undefined)} />}
        <form onSubmit={signIn} noValidate>
          <Field label="Email address"><input type="email" autoComplete="username" placeholder="you@example.com" {...register('email')} />
            {errors.email && <small className="field-error">{errors.email.message}</small>}</Field>
          <Field label="Password"><div className="password-wrap"><input type={show ? 'text' : 'password'} autoComplete="current-password"
            {...register('password')} /><Button size="icon" variant="ghost" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}</Button></div>
            {errors.password && <small className="field-error">{errors.password.message}</small>}</Field>
          <Button className="login-submit" type="submit" disabled={isSubmitting || session.state === 'loading' || session.state === 'active'}>
            {isSubmitting || session.state === 'loading' ? <LoaderCircle size={17} className="animate-spin" /> : null}
            Sign in <ArrowRight size={17} /></Button>
        </form>
      </section>
    </div>
  </main>;
}

