import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'R/WORKS Render Studio — Cloud Rendering',
  description: 'A focused cloud rendering workspace for Remotion creators.',
  applicationName: 'R/WORKS Render Studio',
  themeColor: '#0b0d10',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
