'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { entries, navigation } from '@/lib/navigation';
import { cn, initials, label } from '@/lib/utils';
import { usePermissions, useSession } from '@/providers/app-providers';
import { auth } from '@/services/auth';
import { ApiError } from '@/services/api-client';
import { Failure, Loading } from '@/components/shared';
import { FormDialog } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Brand } from './login';

export function Shell({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  useEffect(() => { if (session.state === 'anonymous') router.replace('/login'); }, [router, session.state]);
  if (session.state === 'active') return <Workspace>{children}</Workspace>;
  return <main className="auth-gate">
    <Brand />
    {session.state === 'unavailable'
      ? <Failure error={session.error} retry={() => void auth.restore()} /> : <Loading rows={2} />}
    {session.state === 'unavailable' && <Button asChild variant="outline"><Link href="/login">Open sign in</Link></Button>}
  </main>;
}

function Workspace({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [logout, setLogout] = useState(false);
  const [search, setSearch] = useState('');
  const { profile, can } = usePermissions();
  const segments = pathname.split('/').filter(Boolean);
  const active = entries.find((entry) => entry.id === segments[0]);
  const allowed = active && can(...active.permissions);

  function searchBookings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = search.trim();
    router.push(value ? '/bookings?q=' + encodeURIComponent(value) : '/bookings');
    setMobile(false);
  }

  return <div className={cn('workspace', collapsed && 'is-collapsed')}>
    <a className="skip-link" href="#workspace-content">Skip to content</a>
    {mobile && <button className="nav-overlay" onClick={() => setMobile(false)} aria-label="Close navigation" />}
    <aside className={cn('sidebar', mobile && 'sidebar-open')} aria-label="Main navigation" id="main-sidebar"
      onKeyDown={(event) => { if (event.key === 'Escape' && mobile) setMobile(false); }}>
      <div className="sidebar-top">
        <Link href="/dashboard" aria-label="Solar Care dashboard" onClick={() => setMobile(false)}><Brand /></Link>
        <Button variant="ghost" size="icon" className="mobile-close" aria-label="Close navigation" onClick={() => setMobile(false)}><X size={19} /></Button>
      </div>
      <nav>{navigation.map((group) => {
        const visible = group.entries.filter((entry) => can(...entry.permissions));
        if (!visible.length) return null;
        return <div className="nav-group" key={group.title}>
          <div className="nav-label">{group.title}</div>
          {visible.map(({ id, label, icon: Icon }) => <Link key={id} className={cn('nav-link', active?.id === id && 'nav-active')}
            title={collapsed ? label : undefined} href={'/' + id} aria-current={active?.id === id ? 'page' : undefined}
            onClick={() => setMobile(false)}><Icon size={18} strokeWidth={1.85} /><span>{label}</span></Link>)}
        </div>;
      })}</nav>
      <div className="sidebar-foot"><Button variant="ghost" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span>Collapse sidebar</span>
      </Button></div>
    </aside>
    <div className="workspace-main">
      <header className="topbar">
        <div className="topbar-left">
          <Button size="icon" variant="ghost" className="mobile-menu" aria-label="Open navigation" aria-expanded={mobile}
            aria-controls="main-sidebar" onClick={() => setMobile(true)}><Menu size={21} /></Button>
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/dashboard">Workspace</Link><ChevronRight size={14} />
            {segments.length > 1 && active ? <><Link href={'/' + active.id}>{active.label}</Link><ChevronRight size={14} /><span>Details</span></>
              : <span>{active?.label ?? 'Dashboard'}</span>}
          </nav>
        </div>
        <div className="topbar-right">
          {can('bookings.read') && <form className="top-search" onSubmit={searchBookings}>
            <Search size={17} /><input aria-label="Search bookings" placeholder="Search bookings…" value={search}
              onChange={(event) => setSearch(event.target.value)} maxLength={120} />
          </form>}
          {profile && <details className="profile-menu">
            <summary><span className="avatar">{initials(profile.full_name)}</span>
              <span className="profile-text"><strong>{profile.full_name}</strong><small>{label(profile.role)}</small></span><ChevronDown size={15} /></summary>
            <div><Link href="/settings"><Settings2 size={16} />Account settings</Link>
              <button onClick={() => setLogout(true)}><LogOut size={16} />Sign out</button></div>
          </details>}
        </div>
      </header>
      <main className="workspace-content" id="workspace-content">
        {allowed ? children : <Failure error={new ApiError('Your account does not have permission for this page.', 403)} />}
      </main>
    </div>
    {logout && <FormDialog title="Sign out" description="End the current administrator session?" fields={[]} submitLabel="Sign out"
      close={() => setLogout(false)} submit={() => auth.logout(false)} />}
  </div>;
}

