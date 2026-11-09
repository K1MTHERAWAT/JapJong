/**
 * Advanced QR Scanner Engine for GFMS (JapJong)
 * Handles:
 * 1. Optimal camera constraints (Continuous Auto-Focus, High Resolution, FPS)
 * 2. Hardware & Digital Zoom (1x - 3x+) + Torch/Flashlight control
 * 3. Multi-pass Image Preprocessing (Contrast Stretch, 3x3 Sharpen Convolution, Integral-Image Adaptive Threshold, Invert)
 * 4. Multi-scale cropping & Rotation compensation for distant, small, blurry, or tilted QR codes
 * 5. Duplicate scan & in-flight processing cooldown guard
 */

export type PreprocessMode =
  | 'normal'
  | 'contrast_sharpen'
  | 'adaptive_threshold'
  | 'invert';

export interface CameraHardwareCapabilities {
  supportsHardwareZoom: boolean;
  minZoom: number;
  maxZoom: number;
  stepZoom: number;
  supportsTorch: boolean;
  supportsContinuousFocus: boolean;
}

export const DEFAULT_CAMERA_CAPABILITIES: CameraHardwareCapabilities = {
  supportsHardwareZoom: false,
  minZoom: 1,
  maxZoom: 3,
  stepZoom: 0.1,
  supportsTorch: false,
  supportsContinuousFocus: false,
};

/**
 * Prevents duplicate scans of the same QR code within a cooldown window
 * and locks scanning while a verification request is in-flight.
 */
export class QrDuplicateGuard {
  private lastToken = '';
  private lastScanAt = 0;
  private inFlight = false;
  private readonly cooldownMs: number;

  constructor(cooldownMs = 4000) {
    this.cooldownMs = cooldownMs;
  }

  /**
   * Returns true if the decoded text should be accepted and processed.
   * Automatically marks the guard as in-flight when accepted.
   */
  tryAcquire(rawText: string, now = Date.now()): boolean {
    const cleaned = (rawText || '').trim();
    if (!cleaned) return false;
    if (this.inFlight) return false;

    if (
      this.lastToken === cleaned &&
      now - this.lastScanAt < this.cooldownMs
    ) {
      return false;
    }

    this.inFlight = true;
    this.lastToken = cleaned;
    this.lastScanAt = now;
    return true;
  }

  release(now = Date.now()): void {
    this.inFlight = false;
    this.lastScanAt = now;
  }

  reset(): void {
    this.inFlight = false;
    this.lastToken = '';
    this.lastScanAt = 0;
  }

  isLocked(): boolean {
    return this.inFlight;
  }
}

/**
 * Computes a responsive QR detection box (78% of the shorter viewport dimension)
 * so users don't have to align the QR code into a tiny box.
 */
export function computeResponsiveQrBox(
  viewfinderWidth: number,
  viewfinderHeight: number,
): { width: number; height: number } {
  const minEdge = Math.min(
    Math.max(viewfinderWidth || 320, 220),
    Math.max(viewfinderHeight || 320, 220),
  );
  const size = Math.max(200, Math.min(420, Math.round(minEdge * 0.8)));
  return { width: size, height: size };
}

/**
 * Returns optimal MediaTrackConstraints for QR scanning in challenging environments.
 */
export function getOptimalVideoConstraints(): MediaTrackConstraints {
  return {
    facingMode: { ideal: 'environment' },
    width: { min: 640, ideal: 1920, max: 2560 },
    height: { min: 480, ideal: 1080, max: 1440 },
    frameRate: { ideal: 24, max: 30 },
    // Advanced continuous auto-focus & exposure for mobile/webcam drivers
    advanced: [
      { focusMode: 'continuous' } as any,
      { exposureMode: 'continuous' } as any,
      { whiteBalanceMode: 'continuous' } as any,
    ],
  };
}

/**
 * Extracts active MediaStreamTrack from a container element ID.
 */
export function getActiveVideoTrack(
  containerId = 'qr-reader',
): MediaStreamTrack | null {
  if (typeof document === 'undefined') return null;
  const container = document.getElementById(containerId);
  const video = container?.querySelector('video') as HTMLVideoElement | null;
  if (!video || !video.srcObject) return null;
  const stream = video.srcObject as MediaStream;
  const tracks = stream.getVideoTracks?.() || [];
  return tracks[0] || null;
}

/**
 * Inspects hardware zoom, torch, and focus capabilities of the active camera track.
 */
export function inspectTrackCapabilities(
  track: MediaStreamTrack | null,
): CameraHardwareCapabilities {
  if (!track || typeof (track as any).getCapabilities !== 'function') {
    return { ...DEFAULT_CAMERA_CAPABILITIES };
  }
  try {
    const caps = (track as any).getCapabilities() || {};
    const hasZoom =
      caps.zoom &&
      typeof caps.zoom.min === 'number' &&
      typeof caps.zoom.max === 'number' &&
      caps.zoom.max > caps.zoom.min;

    const focusModes: string[] = Array.isArray(caps.focusMode)
      ? caps.focusMode
      : [];

    return {
      supportsHardwareZoom: Boolean(hasZoom),
      minZoom: hasZoom ? Math.max(1, caps.zoom.min) : 1,
      maxZoom: hasZoom ? Math.min(5, Math.max(2, caps.zoom.max)) : 3,
      stepZoom: hasZoom && caps.zoom.step ? caps.zoom.step : 0.1,
      supportsTorch: Boolean(caps.torch),
      supportsContinuousFocus: focusModes.includes('continuous'),
    };
  } catch {
    return { ...DEFAULT_CAMERA_CAPABILITIES };
  }
}

/**
 * Applies hardware zoom if supported; returns true if hardware zoom was applied,
 * or false if the caller should use CSS digital zoom fallback.
 */
export async function applyCameraZoom(
  track: MediaStreamTrack | null,
  zoom: number,
  caps: CameraHardwareCapabilities,
): Promise<boolean> {
  if (!track || !caps.supportsHardwareZoom) return false;
  try {
    const clamped = Math.max(caps.minZoom, Math.min(caps.maxZoom, zoom));
    await track.applyConstraints({
      advanced: [{ zoom: clamped } as any],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Toggles hardware torch / flashlight if supported.
 */
export async function applyCameraTorch(
  track: MediaStreamTrack | null,
  torchOn: boolean,
): Promise<boolean> {
  if (!track) return false;
  try {
    await track.applyConstraints({
      advanced: [{ torch: torchOn } as any],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-triggers continuous focus on the active video track when the user taps to focus
 * or when scanning takes longer than expected.
 */
export async function triggerCameraRefocus(
  track: MediaStreamTrack | null,
): Promise<void> {
  if (!track) return;
  try {
    await track.applyConstraints({
      advanced: [{ focusMode: 'continuous' } as any],
    });
  } catch {
    // Ignore if device driver rejects focusMode constraint
  }
}

/* ========================================================================== */
/* Pure Pixel-Buffer Preprocessing Algorithms (Testable in Node & Browser)    */
/* ========================================================================== */

/**
 * Step 1: Grayscale conversion + Histogram Contrast Stretching (2% - 98% range).
 * Dramatically improves low-light, faded print, and glare/washed-out QR codes.
 */
export function grayscaleAndContrastStretch(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  const pixelCount = width * height;
  if (pixelCount === 0) return out;

  const lum = new Uint8Array(pixelCount);
  const hist = new Uint32Array(256);

  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    // Rec. 601 luma
    const y = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
    lum[p] = y;
    hist[y]++;
  }

  const lowCut = Math.max(1, Math.floor(pixelCount * 0.02));
  const highCutCount = Math.max(1, Math.floor(pixelCount * 0.02));

  let minL = 0;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= lowCut) {
      minL = v;
      break;
    }
  }

  let maxL = 255;
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= highCutCount) {
      maxL = v;
      break;
    }
  }

  const range = Math.max(1, maxL - minL);

  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const stretched = Math.max(
      0,
      Math.min(255, Math.round(((lum[p] - minL) * 255) / range)),
    );
    out[i] = stretched;
    out[i + 1] = stretched;
    out[i + 2] = stretched;
    out[i + 3] = 255;
  }

  return out;
}

/**
 * Step 2: 3x3 Sharpening Convolution Filter ([0, -1, 0, -1, 5, -1, 0, -1, 0])
 * Enhances edges of blurry, out-of-focus, or slightly shaky QR codes.
 */
export function sharpenPixelBuffer(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const stretched = grayscaleAndContrastStretch(rgba, width, height);
  const out = new Uint8ClampedArray(stretched.length);
  if (width < 3 || height < 3) return stretched;

  // Copy borders
  out.set(stretched);

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = (rowOffset + x) * 4;
      const center = stretched[idx];
      const top = stretched[((y - 1) * width + x) * 4];
      const bottom = stretched[((y + 1) * width + x) * 4];
      const left = stretched[(rowOffset + (x - 1)) * 4];
      const right = stretched[(rowOffset + (x + 1)) * 4];

      const val = Math.max(
        0,
        Math.min(255, center * 5 - top - bottom - left - right),
      );
      out[idx] = val;
      out[idx + 1] = val;
      out[idx + 2] = val;
      out[idx + 3] = 255;
    }
  }

  return out;
}

/**
 * Step 3: Fast Integral-Image Adaptive Thresholding (Bradley-Roth algorithm).
 * Resolves uneven illumination, shadows, reflections on glossy paper or phone screens.
 */
export function adaptiveThresholdPixelBuffer(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  windowRadius = 12,
  thresholdPercent = 12,
): Uint8ClampedArray {
  const stretched = grayscaleAndContrastStretch(rgba, width, height);
  const out = new Uint8ClampedArray(stretched.length);
  if (width === 0 || height === 0) return out;

  const integral = new Float64Array(width * height);

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      rowSum += stretched[p * 4];
      integral[p] = y === 0 ? rowSum : integral[(y - 1) * width + x] + rowSum;
    }
  }

  const r = Math.max(4, Math.min(windowRadius, Math.floor(Math.min(width, height) / 4)));
  const factor = (100 - thresholdPercent) / 100;

  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - r);
    const y2 = Math.min(height - 1, y + r);
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - r);
      const x2 = Math.min(width - 1, x + r);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);

      let sum = integral[y2 * width + x2];
      if (y1 > 0) sum -= integral[(y1 - 1) * width + x2];
      if (x1 > 0) sum -= integral[y2 * width + (x1 - 1)];
      if (y1 > 0 && x1 > 0) sum += integral[(y1 - 1) * width + (x1 - 1)];

      const idx = (y * width + x) * 4;
      const pixel = stretched[idx];
      const bin = pixel * count < sum * factor ? 0 : 255;

      out[idx] = bin;
      out[idx + 1] = bin;
      out[idx + 2] = bin;
      out[idx + 3] = 255;
    }
  }

  return out;
}

/**
 * Step 4: Invert pixel buffer for white-on-dark QR codes.
 */
export function invertPixelBuffer(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const stretched = grayscaleAndContrastStretch(rgba, width, height);
  const out = new Uint8ClampedArray(stretched.length);
  for (let i = 0; i < stretched.length; i += 4) {
    const inv = 255 - stretched[i];
    out[i] = inv;
    out[i + 1] = inv;
    out[i + 2] = inv;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Unified entry point for pixel buffer preprocessing.
 */
export function preprocessPixelBuffer(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mode: PreprocessMode,
): Uint8ClampedArray {
  switch (mode) {
    case 'contrast_sharpen':
      return sharpenPixelBuffer(rgba, width, height);
    case 'adaptive_threshold':
      return adaptiveThresholdPixelBuffer(rgba, width, height);
    case 'invert':
      return invertPixelBuffer(rgba, width, height);
    case 'normal':
    default:
      return new Uint8ClampedArray(rgba);
  }
}

/* ========================================================================== */
/* Canvas Multi-Pass Decoder for Live Video Frames & Uploaded Images          */
/* ========================================================================== */

/**
 * Renders a source image/video onto a canvas with optional center-crop scale and rotation,
 * then applies the requested pixel preprocessing filter.
 */
export function renderPreprocessedCanvas(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  sourceWidth: number,
  sourceHeight: number,
  options: {
    cropRatio?: number; // 1.0 = full frame, 0.65 = zoomed center crop, 0.45 = tight center crop
    angleDeg?: number;  // 0, -15, 15, etc.
    mode?: PreprocessMode;
    targetSize?: number;
  } = {},
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const cropRatio = options.cropRatio ?? 1.0;
  const angleDeg = options.angleDeg ?? 0;
  const mode = options.mode ?? 'normal';
  const targetSize = options.targetSize ?? 680;

  if (sourceWidth <= 0 || sourceHeight <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Fill white background for rotated bounds
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetSize, targetSize);

  const minSide = Math.min(sourceWidth, sourceHeight);
  const cropSize = Math.max(64, Math.round(minSide * cropRatio));
  const sx = Math.round((sourceWidth - cropSize) / 2);
  const sy = Math.round((sourceHeight - cropSize) / 2);

  ctx.save();
  ctx.translate(targetSize / 2, targetSize / 2);
  if (angleDeg !== 0) {
    ctx.rotate((angleDeg * Math.PI) / 180);
  }
  ctx.drawImage(
    source,
    sx,
    sy,
    cropSize,
    cropSize,
    -targetSize / 2,
    -targetSize / 2,
    targetSize,
    targetSize,
  );
  ctx.restore();

  if (mode !== 'normal') {
    const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
    const processed = preprocessPixelBuffer(
      imgData.data,
      targetSize,
      targetSize,
      mode,
    );
    imgData.data.set(processed);
    ctx.putImageData(imgData, 0, 0);
  }

  return canvas;
}

/**
 * Attempts to decode a canvas using native BarcodeDetector if available,
 * otherwise converts canvas to File and uses Html5Qrcode.scanFile.
 */
async function decodeCanvasElement(
  canvas: HTMLCanvasElement,
  html5Scanner?: any,
): Promise<string | null> {
  // 1. Try native BarcodeDetector first (very fast & supports rotated barcodes well)
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const Detector = (window as any).BarcodeDetector;
      const detector = new Detector({ formats: ['qr_code'] });
      const results = await detector.detect(canvas);
      if (Array.isArray(results) && results.length > 0 && results[0]?.rawValue) {
        return String(results[0].rawValue).trim();
      }
    } catch {
      // Fall through to Html5Qrcode
    }
  }

  // 2. Fallback to Html5Qrcode scanFile
  if (html5Scanner && typeof html5Scanner.scanFile === 'function') {
    try {
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
      if (!blob) return null;
      const file = new File([blob], 'qr-preprocessed.png', { type: 'image/png' });
      const decoded = await html5Scanner.scanFile(file, false);
      if (decoded && String(decoded).trim()) {
        return String(decoded).trim();
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Multi-pass fallback decoder for a live <video> element.
 * Runs when standard frame scanning hasn't caught a blurry, distant, low-light, or tilted QR code.
 */
export async function tryEnhancedVideoFrameDecode(
  containerId = 'qr-reader',
  passIndex = 0,
): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const container = document.getElementById(containerId);
  const video = container?.querySelector('video') as HTMLVideoElement | null;
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return null;
  }

  // Cycle through complementary passes on each tick so the UI stays 60fps smooth
  const passes: Array<{
    cropRatio: number;
    angleDeg: number;
    mode: PreprocessMode;
  }> = [
    { cropRatio: 0.85, angleDeg: 0, mode: 'contrast_sharpen' },
    { cropRatio: 0.58, angleDeg: 0, mode: 'contrast_sharpen' }, // Distant / small QR
    { cropRatio: 0.85, angleDeg: 0, mode: 'adaptive_threshold' }, // Low-light / glare
    { cropRatio: 0.42, angleDeg: 0, mode: 'contrast_sharpen' }, // Very small QR
    { cropRatio: 0.8, angleDeg: 15, mode: 'contrast_sharpen' }, // Tilted QR (+15 deg)
    { cropRatio: 0.8, angleDeg: -15, mode: 'contrast_sharpen' }, // Tilted QR (-15 deg)
    { cropRatio: 0.55, angleDeg: 0, mode: 'adaptive_threshold' }, // Distant + low light
    { cropRatio: 0.85, angleDeg: 0, mode: 'invert' }, // Inverted QR
  ];

  const chosen = passes[passIndex % passes.length];
  const canvas = renderPreprocessedCanvas(
    video,
    video.videoWidth,
    video.videoHeight,
    chosen,
  );
  if (!canvas) return null;

  // Use BarcodeDetector if available, or hidden Html5Qrcode instance
  let hiddenScanner: any = null;
  if (typeof window !== 'undefined' && !('BarcodeDetector' in window)) {
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (document.getElementById('qr-reader-hidden')) {
        hiddenScanner = new Html5Qrcode('qr-reader-hidden');
      }
    } catch {
      // ignore
    }
  }

  return decodeCanvasElement(canvas, hiddenScanner);
}

/**
 * Multi-pass decoder for an uploaded image File.
 * Tries original scan first, then systematically runs multi-scale crops,
 * contrast+sharpening, adaptive thresholding, and rotation compensation.
 */
export async function decodeUploadedQrImageFile(
  file: File,
  hiddenElementId = 'qr-reader-hidden',
): Promise<string> {
  const { Html5Qrcode } = await import('html5-qrcode');
  const scanner = new Html5Qrcode(hiddenElementId);

  // Pass 0: Direct scan
  try {
    const direct = await scanner.scanFile(file, false);
    if (direct && direct.trim()) return direct.trim();
  } catch {
    // Continue to enhanced preprocessing passes
  }

  // Load image into HTMLImageElement
  const imgUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (err) => reject(err);
      el.src = imgUrl;
    });

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const candidatePasses: Array<{
      cropRatio: number;
      angleDeg: number;
      mode: PreprocessMode;
      targetSize: number;
    }> = [
      { cropRatio: 1.0, angleDeg: 0, mode: 'contrast_sharpen', targetSize: 800 },
      { cropRatio: 1.0, angleDeg: 0, mode: 'adaptive_threshold', targetSize: 800 },
      { cropRatio: 0.7, angleDeg: 0, mode: 'contrast_sharpen', targetSize: 800 },
      { cropRatio: 0.5, angleDeg: 0, mode: 'contrast_sharpen', targetSize: 800 },
      { cropRatio: 0.7, angleDeg: 0, mode: 'adaptive_threshold', targetSize: 800 },
      { cropRatio: 1.0, angleDeg: -12, mode: 'contrast_sharpen', targetSize: 800 },
      { cropRatio: 1.0, angleDeg: 12, mode: 'contrast_sharpen', targetSize: 800 },
      { cropRatio: 1.0, angleDeg: -25, mode: 'contrast_sharpen', targetSize: 800 },
      { cropRatio: 1.0, angleDeg: 25, mode: 'contrast_sharpen', targetSize: 800 },
      { cropRatio: 1.0, angleDeg: 0, mode: 'invert', targetSize: 800 },
    ];

    for (const pass of candidatePasses) {
      const canvas = renderPreprocessedCanvas(img, w, h, pass);
      if (!canvas) continue;
      const decoded = await decodeCanvasElement(canvas, scanner);
      if (decoded) {
        return decoded;
      }
    }
  } finally {
    URL.revokeObjectURL(imgUrl);
  }

  throw new Error('QR_NOT_DETECTED');
}

/**
 * Generates contextual Thai guidance messages when scanning takes more than a few seconds.
 */
export function getScannerGuidanceMessage(
  elapsedSeconds: number,
  zoomLevel: number,
  torchOn: boolean,
  supportsTorch: boolean,
): string {
  if (elapsedSeconds < 3) {
    return 'กำลังค้นหาและปรับความคมชัดของ QR Code อัตโนมัติ...';
  }
  if (elapsedSeconds < 6) {
    return zoomLevel <= 1.2
      ? 'คำแนะนำ: หาก QR Code มีขนาดเล็กหรืออยู่ไกล ลองเลื่อนแถบซูม (1.5x – 2.5x) ด้านล่าง'
      : 'คำแนะนำ: ถือกล้องให้นิ่งสักครู่ ระบบกำลังใช้ตัวกรองเพิ่มความคมชัด (Sharpen & Contrast)';
  }
  if (elapsedSeconds < 10) {
    return supportsTorch && !torchOn
      ? 'คำแนะนำ: หากแสงน้อยหรือมืด สามารถกดปุ่ม "เปิดไฟฉาย" หรือเอียงเอกสารเล็กน้อยเพื่อลดแสงสะท้อน'
      : 'คำแนะนำ: ลองเอียงเอกสารเล็กน้อยเพื่อลดแสงสะท้อน หรือขยับให้ QR Code อยู่กึ่งกลางกรอบสแกน';
  }
  return 'หากภาพเบลอมาก สามารถกดแตะที่หน้าจอกล้องเพื่อโฟกัสใหม่ หรือใช้วิธีอัปโหลดภาพ / พิมพ์เลขที่เอกสาร';
}

