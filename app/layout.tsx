import type { Metadata } from 'next';
import './globals.css';
import PushRegistrar from '../components/PushRegistrar';

export const metadata: Metadata = {
  title: 'Manikstu Samarth',
  description: 'Manikstu Samarth: the Odisha agri-business network CRM for managers and telecalling staff.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <PushRegistrar />
      </body>
    </html>
  );
}
