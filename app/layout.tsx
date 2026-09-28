import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeMusic } from '@/components/ThemeMusic';

export const metadata: Metadata = {
  title: 'Letterlock — the word game that fights back',
  description: 'A real-time multiplayer word game. Every round you survive, another letter gets locked. 2–12 players.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b0d1b' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bungee&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&display=swap"
        />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23ff4d6d'/%3E%3Crect x='8' y='14' width='16' height='12' rx='3' fill='%23fff'/%3E%3Cpath d='M11 14v-3a5 5 0 0 1 10 0v3' fill='none' stroke='%23fff' stroke-width='3'/%3E%3C/svg%3E" />
      </head>
      <body><ThemeMusic />{children}</body>
    </html>
  );
}
