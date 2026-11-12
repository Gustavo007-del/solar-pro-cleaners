import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return <main className="auth-gate"><h1 className="section-title">Page unavailable</h1>
    <p className="muted">This page could not be found.</p>
    <Button asChild variant="outline"><Link href="/dashboard">Back to dashboard</Link></Button>
  </main>;
}

