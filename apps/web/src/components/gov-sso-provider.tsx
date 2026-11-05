'use client';

import React from 'react';
import { GovSsoProvider } from 'gov-sso-login';
import { ssoConfig } from '@/lib/sso-config';

export function GovSsoClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <GovSsoProvider
      config={ssoConfig}
      theme={{
        primaryColor: '#0F766E',
        primaryHoverColor: '#0D6860',
        borderRadius: '0.75rem',
      }}
    >
      {children}
    </GovSsoProvider>
  );
}

