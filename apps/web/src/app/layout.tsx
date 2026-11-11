import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/auth-context';
import { GovSsoClientProvider } from '@/components/gov-sso-provider';
import { SidebarPreferenceProvider } from '@/components/sidebar-preference';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'จับจอง · ระบบขอใช้สถานที่ ขอใช้อุปกรณ์ และแจ้งซ่อม',
  description: 'ระบบขอใช้สถานที่ราชการ ขอยืม–คืนครุภัณฑ์ และแจ้งซ่อมบำรุง (จับจอง)',
  icons: {
    icon: '/icon.png',
    shortcut: '/favicon.ico',
    apple: '/icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b6b5c',
};

const themeInitScript = `
(function() {
  try {
    var saved = localStorage.getItem('japjong-theme');
    var isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}

  // ซ่อน Header และ Footer อัตโนมัติของเบราว์เซอร์ (วันที่, หัวเรื่องหน้าเว็บ, URL) ระหว่างสั่งพิมพ์
  try {
    window.addEventListener('beforeprint', function() {
      window._japjong_saved_title = document.title;
      document.title = '';
    });
    window.addEventListener('afterprint', function() {
      if (typeof window._japjong_saved_title === 'string') {
        document.title = window._japjong_saved_title;
      }
    });
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-bg font-sans text-body text-ink antialiased">
        <ThemeProvider>
          <AuthProvider>
            <GovSsoClientProvider>
              <SidebarPreferenceProvider>{children}</SidebarPreferenceProvider>
            </GovSsoClientProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
