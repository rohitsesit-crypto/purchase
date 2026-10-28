import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-archivo',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Flowchart Monitoring System — Saraswat Engineering Services',
  description:
    'Enquiry capture order-to-dispatch workflow: ten accountable steps, per-operator access, and a live control room for administrators.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
