'use client';

import { KeyRound, Plus, ShieldCheck, UserRoundPen } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge, Details, Heading, Panel, Pager, RecordLink, Refresh, Resource, Table } from '@/components/shared';
import { SelectFilter, TextFilter, useDebounced } from '@/components/filters';
import { FormDialog, options, passwordRule, type Input } from '@/components/forms';
import { useAction, useApi, useFilters } from '@/hooks/use-api';
import { label, timestamp } from '@/lib/utils';
import { usePermissions } from '@/providers/app-providers';
import { adminRequest, auth } from '@/services/auth';
import { routes } from '@/services/routes';
import type { Admin, Page, Profile } from '@/types/api';

const nameField = (initial?: string): Input => ({
  name: 'full_name', label: 'Full name', required: true, initial, rule: z.string().trim().min(1).max(100),
});
const emailField = (initial?: string): Input => ({
  name: 'email', label: 'Email', type: 'email', required: true, initial, rule: z.email('Enter a valid email.'),
});

const adminColumns: ColumnDef<Admin>[] = [
  { accessorKey: 'full_name', header: 'Administrator', cell: ({ row }) => <RecordLink href={'/admin-users/' + row.original.id}>{row.original.full_name}</RecordLink> },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'role', header: 'Role', cell: ({ row }) => <Badge value={row.original.role} /> },
  { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => <Badge value={row.original.is_active ? 'active' : 'inactive'} /> },
  { accessorKey: 'last_login_at', header: 'Last sign-in', cell: ({ row }) => timestamp(row.original.last_login_at) },
  { accessorKey: 'created_at', header: 'Created', cell: ({ row }) => timestamp(row.original.created_at) },
];

export function AdminUsers() {
  const { can } = usePermissions();
  const filter = useFilters({ search: '' });
  const search = useDebounced(filter.values.search);
  const query = useApi<Page<Admin>>(routes.users, { ...filter.values, search, page: filter.page });
  const [create, setCreate] = useState(false);
  const action = useAction();
  return <>
    <Heading title="Admin users" description="Manage access for administrators and staff." actions={<>
      <Refresh run={() => void query.refetch()} busy={query.isFetching} />
      {can('admin.users.create') && <Button onClick={() => setCreate(true)}><Plus size={16} />Add admin user</Button>}
    </>} />
    <Panel title="Administrator directory" action={<ShieldCheck size={18} className="panel-icon" />}>
      <div className="toolbar">
        <TextFilter label="Search" value={filter.values.search} onChange={(v) => filter.set('search', v)} placeholder="Name or email" className="search-field" />
        <SelectFilter label="Role" value={filter.values.role ?? ''} all="All roles" choices={options(['owner', 'admin', 'staff'])} onChange={(v) => filter.set('role', v)} />
        <SelectFilter label="Account" value={filter.values.is_active ?? ''} all="All accounts" choices={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} onChange={(v) => filter.set('is_active', v)} />
        <Button variant="ghost" onClick={filter.clear}>Clear filters</Button>
      </div>
      <Resource query={query}>{(data) => <><Table rows={data.items} columns={adminColumns} empty="No administrators match these filters" /><Pager data={data} change={filter.setPage} /></>}</Resource>
    </Panel>
    {create && <FormDialog title="Add admin user" fields={[
      nameField(), emailField(), { name: 'role', label: 'Role', type: 'select', options: options(['admin', 'staff']), initial: 'staff' },
      { name: 'password', label: 'Initial password', type: 'password', required: true, rule: passwordRule, autoComplete: 'new-password' },
    ]} close={() => setCreate(false)} submitLabel="Create admin user"
      submit={(values) => action.mutateAsync({ path: routes.users, method: 'POST', body: { ...values, full_name: values.full_name.trim() } })} />}
  </>;
}

export function AdminRecord({ id }: { id: string }) {
  const { can, profile } = usePermissions();
  const query = useApi<Admin>(routes.user(id));
  const [dialog, setDialog] = useState<'edit' | 'activate' | 'deactivate'>();
  const action = useAction();
  return <Resource query={query}>{(user) => <>
    <Heading title={user.full_name} description="Administrator profile and access" actions={<>
      <Badge value={user.role} />
      {can('admin.users.update') && <Button variant="outline" onClick={() => setDialog('edit')}>Edit user</Button>}
      {user.role !== 'owner' && can('admin.users.deactivate') && (user.is_active
        ? <Button variant="outline" onClick={() => setDialog('deactivate')}>Deactivate</Button>
        : can('admin.users.update') && <Button onClick={() => setDialog('activate')}>Activate</Button>)}
    </>} />
    <Panel title="User profile"><div className="panel-body"><Details items={[
      ['Name', user.full_name], ['Email', user.email], ['Role', label(user.role)],
      ['Status', <Badge value={user.is_active ? 'active' : 'inactive'} />],
      ['Last sign-in', timestamp(user.last_login_at)], ['Created', timestamp(user.created_at)],
    ]} /></div></Panel>
    {dialog === 'edit' && <FormDialog title="Edit admin user" fields={[
      nameField(user.full_name), emailField(user.email),
      ...(user.role !== 'owner' && can('admin.roles.manage') ? [{
        name: 'role', label: 'Role', type: 'select' as const, initial: user.role, options: options(['admin', 'staff']),
      }] : []),
    ]} close={() => setDialog(undefined)} submit={(values) => action.mutateAsync({
      path: routes.user(id), method: 'PATCH', body: {
        full_name: values.full_name.trim(), email: values.email.trim(),
        ...(values.role && values.role !== user.role ? { role: values.role } : {}),
      },
    }).then((result) => { if (id === profile?.id) auth.updateProfile({ ...(result as Admin), permissions: profile.permissions }); })} />}
    {(dialog === 'activate' || dialog === 'deactivate') && <FormDialog title={label(dialog) + ' admin user'}
      description={dialog === 'deactivate' ? 'This revokes the administrator’s active sessions.' : 'This restores the administrator’s ability to sign in.'}
      destructive={dialog === 'deactivate'} fields={[]} close={() => setDialog(undefined)} submitLabel={label(dialog)}
      submit={() => action.mutateAsync(dialog === 'deactivate'
        ? { path: routes.deactivateUser(id), method: 'POST' } : { path: routes.user(id), method: 'PATCH', body: { is_active: true } })} />}
  </>}</Resource>;
}

export function AccountSettings() {
  const query = useApi<Profile>(routes.me);
  const [dialog, setDialog] = useState<'edit' | 'password' | 'logout'>();
  return <>
    <Heading title="Account settings" description="Manage your administrator profile and sessions." />
    <Resource query={query}>{(profile) => <>
      <Panel title="Your profile" action={<Button variant="outline" size="sm" onClick={() => setDialog('edit')}><UserRoundPen size={16} />Edit profile</Button>}>
        <div className="panel-body"><Details items={[
          ['Name', profile.full_name], ['Email', profile.email], ['Role', <Badge value={profile.role} />],
          ['Last sign-in', timestamp(profile.last_login_at)],
        ]} /></div>
      </Panel>
      <Panel title="Security"><div className="panel-body actions">
        <Button variant="outline" onClick={() => setDialog('password')}><KeyRound size={16} />Change password</Button>
        <Button variant="outline" onClick={() => setDialog('logout')}>Sign out everywhere</Button>
      </div></Panel>
      {dialog === 'edit' && <FormDialog title="Edit profile" fields={[nameField(profile.full_name)]} close={() => setDialog(undefined)}
        submit={async (values) => {
          const updated = await adminRequest<Profile>(routes.me, { method: 'PATCH', body: { full_name: values.full_name.trim() } });
          auth.updateProfile(updated);
          await query.refetch();
        }} />}
      {dialog === 'password' && <FormDialog title="Change password" description="This revokes your previous sessions and starts a replacement session here."
        close={() => setDialog(undefined)} submitLabel="Change password" fields={[
          { name: 'current_password', label: 'Current password', type: 'password', required: true, rule: z.string().min(1).max(128), autoComplete: 'current-password' },
          { name: 'new_password', label: 'New password', type: 'password', required: true, rule: passwordRule, autoComplete: 'new-password' },
          { name: 'confirm', label: 'Confirm new password', type: 'password', required: true, autoComplete: 'new-password' },
        ]} validate={(values) => values.new_password !== values.confirm ? 'The new passwords do not match.' : undefined}
        submit={(values) => auth.changePassword({ current_password: values.current_password, new_password: values.new_password })} />}
      {dialog === 'logout' && <FormDialog title="Sign out everywhere" description="End every active session for this account."
        fields={[]} destructive close={() => setDialog(undefined)} submitLabel="Sign out everywhere" submit={() => auth.logout(true)} />}
    </>}</Resource>
  </>;
}

