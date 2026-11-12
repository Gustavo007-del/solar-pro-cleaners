import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter';
import './globals.css';
import { AppProviders } from '@/providers/app-providers';

export const metadata: Metadata = {
  title: { default: 'Solar Care Operations', template: '%s | Solar Care' },
  description: 'Solar Care service administration',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><AppProviders>{children}</AppProviders></body></html>;
}

