import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Proyecto Mini Profe',
  description: 'Asistente educativo con voz para un peluche interactivo.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
