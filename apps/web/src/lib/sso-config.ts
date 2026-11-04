import type { GovSsoConfig } from 'gov-sso-login';

function resolveFrontendUrl(): string {
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }
  return (
    process.env.NEXT_PUBLIC_FRONTEND_URL ||
    'https://japjong.vercel.app'
  );
}

function resolveApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.origin) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      // บน localhost Next.js จะ proxy /api/* ไปยัง backend อัตโนมัติ
      return window.location.origin;
    }
  }
  return (
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000')
  );
}

export const ssoConfig: GovSsoConfig = {
  iamAuthUrl: process.env.NEXT_PUBLIC_IAM_GOV_FRONTEND_URL || 'https://auth.govcenter.co',
  serviceCode: process.env.NEXT_PUBLIC_E_SERVICE_CODE || 'jap-jong',
  get apiBaseUrl() {
    return resolveApiBaseUrl();
  },
  get callbackUrl() {
    return `${resolveFrontendUrl()}/auth/callback`;
  },
  ssoCallbackPath: '/api/auth/sso-callback',
};

