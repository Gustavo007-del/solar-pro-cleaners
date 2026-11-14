import { notFound } from 'next/navigation';
import { z } from 'zod';
import { CrmWorkspace } from '@/components/crm/workspace';

export const metadata = { title: 'CRM', robots: { index: false, follow: false } };

export default async function CrmPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  if (path.length === 0) return <CrmWorkspace view="overview" />;
  const [section, id] = path;
  if (path.length === 1) {
    if (section === 'analytics') return <CrmWorkspace view="overview" />;
    if (section === 'leads' || section === 'follow-ups' || section === 'calls' || section === 'sources' || section === 'import') {
      return <CrmWorkspace view={section} />;
    }
  }
  if (path.length === 2 && section === 'leads') {
    if (id === 'new') return <CrmWorkspace view="new" />;
    if (z.uuid().safeParse(id).success) return <CrmWorkspace view="detail" id={id} />;
  }
  notFound();
}
