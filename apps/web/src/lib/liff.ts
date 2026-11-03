'use client';

let liffInstance: typeof import('@line/liff').default | null = null;
let initPromise: Promise<typeof import('@line/liff').default | null> | null = null;

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

export async function loginWithLiff(redirectUri?: string): Promise<void> {
  const liff = await getLiffInstance();
  if (!liff) return;
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: redirectUri || (typeof window !== 'undefined' ? window.location.href : undefined) });
  }
}

export async function closeLiffWindow(): Promise<void> {
  const liff = await getLiffInstance();
  if (!liff) return;
  if (liff.isInClient()) {
    liff.closeWindow();
  }
}

