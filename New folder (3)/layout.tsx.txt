
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Suspense } from 'react';
import { CommunityProvider } from '@/context/community-context';

export const metadata: Metadata = {
  title: 'Cosmic Raid App',
  description: 'Manage your Discord community with the power of AI.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
      </head>
      <body className="font-body antialiased bg-background text-foreground">
          <Suspense fallback={<div>Loading...</div>}>
            <CommunityProvider>
              {children}
            </CommunityProvider>
          </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
