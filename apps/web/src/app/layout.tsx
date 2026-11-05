import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/auth-context';
import { GovSsoClientProvider } from '@/components/gov-sso-provider';
import { SidebarPreferenceProvider } from '@/components/sidebar-preference';

export const metadata: Metadata = {
  title: 'จับจอง · ระบบขอใช้สถานที่ ขอใช้อุปกรณ์ และแจ้งซ่อม',
  description: 'ระบบขอใช้สถานที่ราชการ ขอยืม–คืนครุภัณฑ์ และแจ้งซ่อมบำรุง (จับจอง)',
  icons: {
    icon: '/icon.png',
    shortcut: '/favicon.ico',
    apple: '/icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="bg-bg font-sans text-body text-ink antialiased">
        <AuthProvider>
          <GovSsoClientProvider>
            <SidebarPreferenceProvider>{children}</SidebarPreferenceProvider>
          </GovSsoClientProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
