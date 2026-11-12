'use client';

/**
 * =====================================================================
 * โมดูลจัดการ LINE Front-end Framework (LIFF SDK Client Module)
 * =====================================================================
 * หน้าที่หลัก:
 * 1. getLiffInstance: โหลดโมดูล @line/liff แบบไดนามิก (Lazy load ป้องกัน SSR crash)
 * 2. initLiff: เริ่มต้นการทำงานของ LIFF ด้วย NEXT_PUBLIC_LIFF_ID
 * 3. getLiffIdToken: ดึง ID Token (JWT) เพื่อนำไปล็อกอิน Single Sign-On กับ API
 * 4. loginWithLiff & closeLiffWindow: ควบคุมวงจรหน้าต่างของ LINE App
 * 5. isValidLocalTarget & resolveLiffTarget: ถอดรหัสและตรวจสอบเส้นทางเป้าหมาย (Deep Link)
 *    จาก `liff.state` หรือ `target` อย่างปลอดภัย ป้องกันการโจมตี Open Redirect
 */

let liffInstance: typeof import('@line/liff').default | null = null;
let initPromise: Promise<typeof import('@line/liff').default | null> | null = null;

// ดึง Instance ของ LIFF SDK แบบ Singleton
export async function getLiffInstance(): Promise<typeof import('@line/liff').default | null> {
  if (typeof window === 'undefined') return null;
  if (liffInstance) return liffInstance;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const liffModule = await import('@line/liff');
        liffInstance = liffModule.default;
        return liffInstance;
      } catch (err) {
        console.warn('Failed to load @line/liff module', err);
        return null;
      }
    })();
  }

  return initPromise;
}

// เริ่มต้นการทำงานของ LIFF SDK
export async function initLiff(customLiffId?: string): Promise<{
  ok: boolean;
  liff: typeof import('@line/liff').default | null;
  isInClient: boolean;
  isLoggedIn: boolean;
  error?: string;
}> {
  if (typeof window === 'undefined') {
    return { ok: false, liff: null, isInClient: false, isLoggedIn: false, error: 'SSR environment' };
  }

  const liff = await getLiffInstance();
  if (!liff) {
    return { ok: false, liff: null, isInClient: false, isLoggedIn: false, error: 'LIFF SDK not available' };
  }

  const liffId = (customLiffId || process.env.NEXT_PUBLIC_LIFF_ID || '').trim();
  if (!liffId) {
    return {
      ok: false,
      liff,
      isInClient: false,
      isLoggedIn: false,
      error: 'NEXT_PUBLIC_LIFF_ID is not configured',
    };
  }

  try {
    await liff.init({ liffId });
    const isInClient = liff.isInClient();
    const isLoggedIn = liff.isLoggedIn();
    return {
      ok: true,
      liff,
      isInClient,
      isLoggedIn,
    };
  } catch (err: any) {
    const msg = err?.message || 'Failed to initialize LIFF';
    console.error('LIFF initialization error:', err);
    return {
      ok: false,
      liff,
      isInClient: false,
      isLoggedIn: false,
      error: msg,
    };
  }
}

// ดึง ID Token จาก LIFF
export async function getLiffIdToken(): Promise<string | null> {
  const liff = await getLiffInstance();
  if (!liff) return null;
  try {
    if (!liff.isLoggedIn()) return null;
    return liff.getIDToken();
  } catch (err) {
    console.error('Failed to get LIFF ID Token', err);
    return null;
  }
}

// ส่งผู้ใช้ไปหน้าเข้าสู่ระบบของ LINE
export async function loginWithLiff(redirectUri?: string): Promise<void> {
  const liff = await getLiffInstance();
  if (!liff) return;
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: redirectUri || (typeof window !== 'undefined' ? window.location.href : undefined) });
  }
}

// สั่งปิดหน้าต่าง LIFF ในแอปพลิเคชัน LINE
export async function closeLiffWindow(): Promise<void> {
  const liff = await getLiffInstance();
  if (!liff) return;
  if (liff.isInClient()) {
    liff.closeWindow();
  }
}

/**
 * ตรวจสอบความถูกต้องของ Local Target Path ป้องกันช่องโหว่ Open Redirect
 * ต้องเริ่มต้นด้วย '/' และห้ามตามด้วย '/' อีกตัว (เช่น '//malicious.com')
 */
export function isValidLocalTarget(path?: string | null): boolean {
  if (!path || typeof path !== 'string') return false;
  const trimmed = path.trim();
  return trimmed.startsWith('/') && !trimmed.startsWith('//');
}

/**
 * สกัด target URL จาก searchParams หรือ query string หรือ liff.state
 * รองรับทั้งกรณี:
 * 1) ?target=/borrow หรือ ?redirect=/borrow
 * 2) ?liff.state=%3Ftarget%3D%2Fborrow (หรือ URL-encoded ซ้อนกันหลายชั้น)
 * 3) ?liff.state=%2Fborrow หรือ /borrow
 * 4) ?liff.state=%3Fredirect%3D%2Fborrow
 * 5) URL เต็ม https://.../borrow (ดึงเฉพาะ pathname + search)
 */
export function resolveLiffTarget(
  searchParams?: { get: (name: string) => string | null } | null,
  rawUrlOrSearch?: string | null,
  fallback = '/',
): string {
  let search = '';
  if (typeof rawUrlOrSearch === 'string') {
    const qIdx = rawUrlOrSearch.indexOf('?');
    search = qIdx >= 0 ? rawUrlOrSearch.slice(qIdx) : rawUrlOrSearch;
  } else if (typeof window !== 'undefined' && window.location) {
    search = window.location.search;
  }

  let urlParams: URLSearchParams | null = null;
  if (search) {
    try {
      urlParams = new URLSearchParams(search);
    } catch {}
  }

  const readKey = (key: string): string | null => {
    if (searchParams) {
      const val = searchParams.get(key);
      if (val !== null && val !== undefined) return val;
    }
    if (urlParams) {
      return urlParams.get(key);
    }
    return null;
  };

  // 1. ตรวจสอบ direct params: target หรือ redirect
  const direct = readKey('target') || readKey('redirect');
  if (isValidLocalTarget(direct)) {
    return direct!;
  }

  // 2. ตรวจสอบ liff.state
  const liffState = readKey('liff.state');
  if (liffState) {
    let decoded = liffState.trim();
    // Decode ซ้ำเผื่อมีการ encode หลายชั้น (สูงสุด 3 ครั้ง)
    for (let i = 0; i < 3; i++) {
      if (decoded.includes('%')) {
        try {
          decoded = decodeURIComponent(decoded);
        } catch {
          break;
        }
      } else {
        break;
      }
    }

    // กรณีเป็น local path ตรงๆ เช่น "/borrow"
    if (isValidLocalTarget(decoded)) {
      return decoded;
    }

    // กรณีเป็น query string เช่น "?target=/borrow" หรือ "target=/borrow"
    const cleanQuery = decoded.startsWith('?') ? decoded.slice(1) : decoded;
    try {
      const innerParams = new URLSearchParams(cleanQuery);
      const innerTarget = innerParams.get('target') || innerParams.get('redirect');
      if (innerTarget) {
        let cleanSub = innerTarget.trim();
        try {
          if (cleanSub.includes('%')) cleanSub = decodeURIComponent(cleanSub);
        } catch {}
        if (isValidLocalTarget(cleanSub)) {
          return cleanSub;
        }
      }
    } catch {}

    // กรณีเป็น full URL เช่น "https://japjong.vercel.app/borrow"
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
      try {
        const parsed = new URL(decoded);
        const fullLocal = `${parsed.pathname}${parsed.search}`;
        if (isValidLocalTarget(fullLocal) && fullLocal !== '/') {
          return fullLocal;
        }
      } catch {}
    }
  }

  return fallback;
}
