import type { GovSsoConfig } from 'gov-sso-login';

const GOVCENTER_ALLOWED_DOMAINS = ['govcenter.co', 'gov.co'];
const GOVCENTER_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function resolveCallbackUrlWithSource(): { url: string; source: string } {
  if (process.env.NEXT_PUBLIC_CALLBACK_URL) {
    return {
      url: process.env.NEXT_PUBLIC_CALLBACK_URL,
      source: 'env:NEXT_PUBLIC_CALLBACK_URL',
    };
  }
  const customFrontend = process.env.NEXT_PUBLIC_FRONTEND_URL;
  if (customFrontend && customFrontend.includes('/auth/callback')) {
    return {
      url: customFrontend,
      source: 'env:NEXT_PUBLIC_FRONTEND_URL (with /auth/callback)',
    };
  }
  let base = 'https://japjong.vercel.app';
  let source = 'fallback:https://japjong.vercel.app';
  if (typeof window !== 'undefined' && window.location.origin) {
    base = window.location.origin;
    source = 'window.location.origin';
  } else if (customFrontend) {
    base = customFrontend;
    source = 'env:NEXT_PUBLIC_FRONTEND_URL';
  }
  base = base.replace(/\/+$/, '');
  return {
    url: `${base}/auth/callback`,
    source,
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

/**
 * จำลองการทำงานของฟังก์ชัน normalizeRedirectUrl ใน auth.govcenter.co
 * เพื่อแสดง Log ว่าทำไมและจุดไหนที่ auth.govcenter.co โยนกลับไปหน้า /dashboard
 */
export function inspectGovCenterRedirectBehavior() {
  const { url: callbackUrl, source: callbackSource } = resolveCallbackUrlWithSource();
  const iamAuthUrl = process.env.NEXT_PUBLIC_IAM_GOV_FRONTEND_URL || 'https://auth.govcenter.co';
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
      rejectReason = `Hostname "${hostname}" ไม่อยู่ใน Whitelist ของ auth.govcenter.co (อนุญาตเฉพาะ ${GOVCENTER_ALLOWED_DOMAINS.join(', ')} และ localhost)`;
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
  console.log('5. IAM Auth URL:', info.iamAuthUrl);

  if (info.willRedirectToGovDashboard) {
    console.warn(
      '⚠️ [จุดที่ถูกโยนไป /dashboard บน auth.govcenter.co]:',
      `\n  • สาเหตุ: ${info.rejectReason}`,
      `\n  • จุดที่ 1 (ตอนโหลดหน้า auth.govcenter.co/auth/login):`,
      `\n      A = normalizeRedirectUrl("${info.callbackUrl}") || "/dashboard"`,
      `\n      ผลลัพธ์: normalizeRedirectUrl คืนค่า null -> ตัวแปร A จึงกลายเป็น "/dashboard"`,
      `\n  • จุดที่ 2 (ตอนกดปุ่มเข้าสู่ระบบ Email/Password บน GovCenter):`,
      `\n      if (A.startsWith("http")) { window.location.assign(A) } else { router.push(A) }`,
      `\n      ผลลัพธ์: เนื่องจาก A คือ "/dashboard" (ไม่ได้ขึ้นต้นด้วย http) ระบบจึงสั่ง router.push("/dashboard")`,
      `\n  • จุดที่ 3 (ตอนกดปุ่มเข้าสู่ระบบด้วย LINE บน GovCenter):`,
      `\n      isSafeRedirectUrl(A) -> ส่งพารามิเตอร์ callback=%2Fdashboard ไปยัง LINE Login แทน URL ของ Vercel`,
    );
  } else {
    console.info(
      '✅ [ผ่านเกณฑ์ Whitelist ของ auth.govcenter.co]:',
      `\n  • normalizeRedirectUrl("${info.callbackUrl}") -> "${info.normalizedOnGovCenter}"`,
      `\n  • ตัวแปร A เริ่มต้นด้วย "http" -> เมื่อล็อกอินเสร็จจะเรียก window.location.assign("${info.normalizedOnGovCenter}?code=...&service=${info.serviceCode}") กลับมาที่เว็บเราสำเร็จ`,
    );
  }
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

