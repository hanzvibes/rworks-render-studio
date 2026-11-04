import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'R/WORKS Render Studio', description: 'Render Remotion projects from the cloud.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
