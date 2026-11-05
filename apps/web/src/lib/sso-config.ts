import type { GovSsoConfig, SsoCallbackResult } from 'gov-sso-login';

const GOVCENTER_ALLOWED_DOMAINS = ['govcenter.co', 'gov.co'];
const GOVCENTER_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
export const GOV_SSO_STATE_KEY = 'gov_sso_state';

function resolveCallbackUrlWithSource(): { url: string; source: string } {
  if (
    typeof window !== 'undefined' &&
    window.location.origin &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return {
      url: `${window.location.origin}/auth/callback`,
      source: 'window.location.origin (localhost)',
    };
  }

  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;
  if (frontendUrl) {
    const cleanBase = frontendUrl.replace(/\/+$/, '');
    const url = cleanBase.endsWith('/auth/callback') ? cleanBase : `${cleanBase}/auth/callback`;
    return {
      url,
      source: 'env:NEXT_PUBLIC_FRONTEND_URL',
    };
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    return {
      url: `${window.location.origin.replace(/\/+$/, '')}/auth/callback`,
      source: 'window.location.origin',
    };
  }

  return {
    url: 'https://japjong.vercel.app/auth/callback',
    source: 'fallback:https://japjong.vercel.app',
  };
}

function resolveCallbackUrl(): string {
  return resolveCallbackUrlWithSource().url;
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

export function resolveIamApiUrl(): string {
  return (process.env.NEXT_PUBLIC_IAM_API_URL || 'https://api-auth.govcenter.co').replace(/\/+$/, '');
}

export function resolveGovLineChannelId(): string {
  return (process.env.NEXT_PUBLIC_GOV_LINE_CHANNEL_ID || '2008946775').trim();
}

/**
 * สร้างรหัส CSRF State 64-hex และบันทึกลง sessionStorage (มาตรฐานเดียวกับ TownTrack)
 */
export function generateGovSsoState(): string {
  const bytes = new Uint8Array(32);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(GOV_SSO_STATE_KEY, state);
    } catch {
      // ignore storage errors
    }
  }
  return state;
}

/**
 * สร้าง URL สำหรับเข้าสู่ระบบ Gov Center ผ่าน LINE OAuth โดยตรงไปยัง api-auth.govcenter.co/auth/line/callback
 * (ทำงานเหมือน TownTrack `qne` เพื่อหลีกเลี่ยง Domain Filter บนหน้า auth.govcenter.co/auth/login ที่บังคับดีดไป /dashboard)
 */
export function buildGovCenterLineAuthorizeUrl(): {
  authorizeUrl: string;
  state: string;
  callbackWithState: string;
  lineRedirectUri: string;
} {
  const state = generateGovSsoState();
  const callbackUrlObj = new URL(resolveCallbackUrl());
  callbackUrlObj.searchParams.set('state', state);
  const callbackWithState = callbackUrlObj.toString();

  const iamApiUrl = resolveIamApiUrl();
  const lineChannelId = resolveGovLineChannelId();
  const serviceCode = ssoConfig.serviceCode;
  const lineRedirectUri = `${iamApiUrl}/auth/line/callback`;

  const innerState = new URLSearchParams({
    callback: callbackWithState,
    service: serviceCode,
  }).toString();

  const authorizeParams = new URLSearchParams({
    response_type: 'code',
    client_id: lineChannelId,
    redirect_uri: lineRedirectUri,
    state: innerState,
    scope: 'profile openid email',
  });

  return {
    authorizeUrl: `https://access.line.me/oauth2/v2.1/authorize?${authorizeParams.toString()}`,
    state,
    callbackWithState,
    lineRedirectUri,
  };
}

/**
 * เข้าสู่ระบบ Gov Center ด้วยอีเมลและรหัสผ่านผ่าน Backend API (Server-to-Server แบบเดียวกับ TownTrack)
 */
export async function loginGovCenterWithPassword(
  email: string,
  password: string,
): Promise<SsoCallbackResult> {
  const endpoint = `${ssoConfig.apiBaseUrl}/api/auth/sso-login`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      (Array.isArray(data?.message) ? data.message.join(', ') : data?.message) ||
      data?.error ||
      `เข้าสู่ระบบ Gov Center ไม่สำเร็จ (${response.status})`;
    throw new Error(msg);
  }
  return data as SsoCallbackResult;
}

/**
 * แลก Authorization Code หรือ LINE Ticket กับ Backend API
 */
export async function exchangeGovSsoCallback(payload: {
  code?: string;
  ticket?: string;
  state?: string;
}): Promise<SsoCallbackResult> {
  const endpoint = `${ssoConfig.apiBaseUrl}${ssoConfig.ssoCallbackPath || '/api/auth/sso-callback'}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      (Array.isArray(data?.message) ? data.message.join(', ') : data?.message) ||
      data?.error ||
      `การยืนยันตัวตนกับ Gov Center ไม่สำเร็จ (${response.status})`;
    throw new Error(msg);
  }
  return data as SsoCallbackResult;
}

/**
 * จำลองการทำงานของฟังก์ชัน normalizeRedirectUrl ใน auth.govcenter.co
 * เพื่อแสดง Log ว่าทำไมและจุดไหนที่ auth.govcenter.co โยนกลับไปหน้า /dashboard
 */
export function inspectGovCenterRedirectBehavior() {
  const { url: callbackUrl, source: callbackSource } = resolveCallbackUrlWithSource();
  const iamAuthUrl = process.env.NEXT_PUBLIC_IAM_GOV_FRONTEND_URL || 'https://auth.govcenter.co';
  const iamApiUrl = resolveIamApiUrl();
  const serviceCode = process.env.NEXT_PUBLIC_E_SERVICE_CODE || 'jap-jong';
  const apiBaseUrl = resolveApiBaseUrl();

  let hostname = '';
  let protocol = '';
  let isLocalhost = false;
  let isWhitelistedDomain = false;
  let normalizedOnGovCenter: string | null = null;
  let rejectReason: string | null = null;

  try {
    const parsed = new URL(callbackUrl);
    hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    protocol = parsed.protocol;
    isLocalhost = GOVCENTER_LOCAL_HOSTS.has(hostname);
    isWhitelistedDomain = GOVCENTER_ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );

    if (protocol !== 'https:' && protocol !== 'http:') {
      rejectReason = `Protocol ไม่ถูกต้อง (${protocol})`;
    } else if (protocol !== 'https:' && !isLocalhost) {
      rejectReason = `ไม่ใช่ HTTPS และไม่ใช่ localhost (${callbackUrl})`;
    } else if (!isLocalhost && !isWhitelistedDomain) {
      rejectReason = `Hostname "${hostname}" ไม่อยู่ใน Frontend Whitelist ของ auth.govcenter.co (จึงใช้ Direct API Flow ผ่าน ${iamApiUrl} แบบเดียวกับ TownTrack)`;
    } else {
      normalizedOnGovCenter = parsed.toString();
    }
  } catch (err) {
    rejectReason = `URL ไม่ถูกต้อง: ${(err as Error).message}`;
  }

  const finalGovCenterTarget = normalizedOnGovCenter || '/dashboard';
  const willRedirectToGovDashboard = finalGovCenterTarget === '/dashboard';

  return {
    iamAuthUrl,
    iamApiUrl,
    serviceCode,
    apiBaseUrl,
    callbackUrl,
    callbackSource,
    hostname,
    protocol,
    isLocalhost,
    isWhitelistedDomain,
    normalizedOnGovCenter,
    finalGovCenterTarget,
    willRedirectToGovDashboard,
    rejectReason,
  };
}

export function logGovSsoDiagnostic(stage: string) {
  if (typeof window === 'undefined') return;
  const info = inspectGovCenterRedirectBehavior();

  console.group(`[GovSSO Trace] 📌 ${stage}`);
  console.log('1. Origin ปัจจุบัน:', window.location.origin);
  console.log('2. Service Code:', info.serviceCode);
  console.log('3. Callback URL ที่ส่งไป:', info.callbackUrl, `(ที่มา: ${info.callbackSource})`);
  console.log('4. API Base URL:', info.apiBaseUrl);
  console.log('5. IAM API URL (Direct SSO):', info.iamApiUrl);
  console.info(
    '✅ [โหมด Direct Gov Center SSO (TownTrack Pattern)]:',
    `\n  • LINE Login ของ Gov Center -> ส่งตรงไป ${info.iamApiUrl}/auth/line/callback (ตรวจสอบกับฐานข้อมูล EService baseUrl="https://japjong.vercel.app")`,
    `\n  • Email/Password ของ Gov Center -> ส่งตรงไป POST ${info.apiBaseUrl}/api/auth/sso-login -> ${info.iamApiUrl}/auth/login?service=${info.serviceCode}`,
  );
  console.groupEnd();

  return info;
}

export const ssoConfig: GovSsoConfig = {
  iamAuthUrl: process.env.NEXT_PUBLIC_IAM_GOV_FRONTEND_URL || 'https://auth.govcenter.co',
  serviceCode: process.env.NEXT_PUBLIC_E_SERVICE_CODE || 'jap-jong',
  get apiBaseUrl() {
    return resolveApiBaseUrl();
  },
  get callbackUrl() {
    return resolveCallbackUrl();
  },
  ssoCallbackPath: '/api/auth/sso-callback',
};
