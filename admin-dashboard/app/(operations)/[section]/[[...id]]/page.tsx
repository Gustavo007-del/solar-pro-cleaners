import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { entries } from '@/lib/navigation';
import { Loading } from '@/components/shared';
import { Overview } from '@/components/dashboard/overview';
import { BookingList } from '@/components/bookings/booking-list';
import { BookingDetail } from '@/components/bookings/booking-detail';
import { Customers, CustomerRecord } from '@/components/customers/customers';
import { Technicians, TechnicianRecord } from '@/components/technicians/technicians';
import { AvailabilityPage, BusinessSettings, ServiceAreas, ServiceRecord, Services } from '@/components/business/business';
import { BookingReports, CustomerReports, TechnicianReports } from '@/components/dashboard/reports';
import { AccountSettings, AdminRecord, AdminUsers } from '@/components/admin/accounts';

type Props = { params: Promise<{ section: string; id?: string[] }> };
export async function generateMetadata({ params }: Props) {
  const { section } = await params;
  return { title: entries.find((entry) => entry.id === section)?.label ?? 'Page unavailable' };
}
export default async function Section({ params }: Props) {
  const { section, id = [] } = await params;
  if (id.length > 1 || (id[0] && !z.uuid().safeParse(id[0]).success)) notFound();
  const key = id[0];
  let content: ReactNode;
  if (section === 'bookings') content = key ? <BookingDetail id={key} /> : <BookingList />;
  else if (section === 'customers') content = key ? <CustomerRecord id={key} /> : <Customers />;
  else if (section === 'technicians') content = key ? <TechnicianRecord id={key} /> : <Technicians />;
  else if (section === 'services') content = key ? <ServiceRecord id={key} /> : <Services />;
  else if (section === 'admin-users') content = key ? <AdminRecord id={key} /> : <AdminUsers />;
  else if (key) notFound();
  else {
    const pages: Record<string, ReactNode> = {
      dashboard: <Overview />, assignments: <BookingList assignments />, 'service-areas': <ServiceAreas />,
      availability: <AvailabilityPage />, business: <BusinessSettings />, 'booking-reports': <BookingReports />,
      'customer-reports': <CustomerReports />, 'technician-reports': <TechnicianReports />, settings: <AccountSettings />,
    };
    content = Object.hasOwn(pages, section) ? pages[section] : notFound();
  }
  return <Suspense fallback={<Loading />}>{content}</Suspense>;
}

