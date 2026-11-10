/**
 * เครื่องยนต์สแกนและประมวลผล QR Code ขั้นสูงสำหรับระบบจับจอง (JapJong)
 * หน้าที่หลัก:
 * 1. กำหนดค่ากล้องที่เหมาะสมที่สุด (โฟกัสอัตโนมัติต่อเนื่อง, ความละเอียดสูง, อัตราเฟรมเรตลื่นไหล)
 * 2. ควบคุมระดับการซูมทั้งแบบฮาร์ดแวร์และดิจิทัล (1x - 3x+) พร้อมระบบเปิด/ปิดไฟฉาย (Torch)
 * 3. ประมวลผลภาพล่วงหน้าหลายระดับ (Multi-pass Image Preprocessing: ปรับความเปรียบต่าง, ฟิลเตอร์เพิ่มความคมชัด 3x3, ปรับค่าขีดแบ่งแสงแบบปรับตัวตามพื้นที่, กลับสีภาพ)
 * 4. ครอปภาพหลายระยะและชดเชยการหมุนเอียง สำหรับ QR Code ที่มีขนาดเล็ก อยู่ไกล เบลอ หรือเอียง
 * 5. ป้องกันการสแกนซ้ำซ้อนและระงับการทำงานซ้ำระหว่างที่กำลังส่งคำขอตรวจสอบไปยังเซิร์ฟเวอร์
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
 * ระบบป้องกันการสแกน QR Code ซ้ำซ้อนภายในช่วงเวลาคูลดาวน์ที่กำหนด
 * และล็อกการสแกนขณะที่คำขอกำลังประมวลผล (in-flight)
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
   * คืนค่า true หากข้อความที่ถอดรหัสได้ควรได้รับการยอมรับและนำไปประมวลผลต่อ
   * จะทำการตั้งค่าสถานะล็อก inFlight เป็น true ให้อัตโนมัติเมื่อยอมรับ
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
 * คำนวณขนาดกรอบสแกน QR Code ที่ยืดหยุ่นตามขนาดหน้าจอ (78% ของด้านที่สั้นกว่าของช่องมอง)
 * เพื่อให้ผู้ใช้ไม่ต้องเล็ง QR Code ให้ตรงกับกล่องขนาดเล็กเกินไป
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
 * คืนค่าเงื่อนไขการทำงานของกล้อง (MediaTrackConstraints) ที่เหมาะสมที่สุดสำหรับสภาพแวดล้อมที่ท้าทาย
 */
export function getOptimalVideoConstraints(): MediaTrackConstraints {
  return {
    facingMode: { ideal: 'environment' },
    width: { min: 640, ideal: 1920, max: 2560 },
    height: { min: 480, ideal: 1080, max: 1440 },
    frameRate: { ideal: 24, max: 30 },
    // ตั้งค่าโฟกัสอัตโนมัติต่อเนื่องและชดเชยแสงสำหรับไดรเวอร์กล้องมือถือ/เว็บแคม
    advanced: [
      { focusMode: 'continuous' } as any,
      { exposureMode: 'continuous' } as any,
      { whiteBalanceMode: 'continuous' } as any,
    ],
  };
}

/**
 * ดึงแทร็กวิดีโอ (MediaStreamTrack) ที่กำลังทำงานอยู่จากอิลิเมนต์เป้าหมายหรือไอดีคอนเทนเนอร์
 */
export function getActiveVideoTrack(
  target: string | HTMLVideoElement | null = 'qr-reader',
): MediaStreamTrack | null {
  if (typeof document === 'undefined') return null;
  let video: HTMLVideoElement | null = null;
  if (typeof target === 'string') {
    const el = document.getElementById(target);
    video = el instanceof HTMLVideoElement ? el : (el?.querySelector('video') as HTMLVideoElement | null);
  } else if (target instanceof HTMLVideoElement) {
    video = target;
  }
  if (!video || !video.srcObject) return null;
  const stream = video.srcObject as MediaStream;
  const tracks = stream.getVideoTracks?.() || [];
  return tracks[0] || null;
}

/**
 * ตรวจสอบความสามารถของฮาร์ดแวร์กล้อง เช่น การซูม, ไฟฉาย และระบบโฟกัสอัตโนมัติต่อเนื่อง
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
 * ปรับระดับการซูมด้วยฮาร์ดแวร์กล้อง (หากฮาร์ดแวร์รองรับ)
 * คืนค่า true หากปรับซูมระดับฮาร์ดแวร์สำเร็จ หรือ false หากควรใช้การซูมแบบดิจิทัล (CSS Zoom) ทดแทน
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
 * เปิดหรือปิดไฟฉาย (Torch) ของกล้องหากฮาร์ดแวร์รองรับ
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
 * สั่งกระตุ้นระบบโฟกัสอัตโนมัติต่อเนื่องใหม่อีกครั้งเมื่อผู้ใช้แตะที่หน้าจอเพื่อโฟกัส
 * หรือเมื่อระบบตรวจพบว่าการสแกนใช้เวลานานกว่าปกติ
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
    // ละเว้นหากไดรเวอร์ของอุปกรณ์ไม่รองรับคำสั่ง focusMode
  }
}

/* ========================================================================== */
/* อัลกอริทึมประมวลผลพิกเซลบัฟเฟอร์ภาพโดยตรง (ทดสอบได้ทั้งบน Node.js และเบราว์เซอร์) */
/* ========================================================================== */

/**
 * ขั้นตอนที่ 1: แปลงภาพเป็นโทนสีเทา (Grayscale) พร้อมยืดความเปรียบต่างของฮิสโตแกรม (Histogram Contrast Stretching ช่วง 2% - 98%)
 * ช่วยให้อ่าน QR Code ในที่แสงน้อย ซีดจาง หรือมีแสงสะท้อนจ้าบนหน้าจอ/กระดาษมันได้ดียิ่งขึ้นอย่างมาก
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
    // คำนวณความสว่างตามมาตรฐาน Rec. 601 Luma
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
 * ขั้นตอนที่ 2: ฟิลเตอร์สังเคราะห์ความคมชัดขนาด 3x3 ([0, -1, 0, -1, 5, -1, 0, -1, 0])
 * เพิ่มความคมชัดตามแนวขอบ สำหรับ QR Code ที่ภาพเบลอ หลุดโฟกัส หรือมีการสั่นไหวเล็กน้อย
 */
export function sharpenPixelBuffer(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const stretched = grayscaleAndContrastStretch(rgba, width, height);
  const out = new Uint8ClampedArray(stretched.length);
  if (width < 3 || height < 3) return stretched;

  // คัดลอกพิกเซลบริเวณขอบภาพ
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
 * ขั้นตอนที่ 3: ปรับค่าขีดแบ่งแสงแบบปรับตัวตามพื้นที่ความสว่างอย่างรวดเร็ว (อัลกอริทึม Bradley-Roth ผ่านภาพอินทิกรัล)
 * แก้ไขปัญหาแสงตกกระทบไม่สม่ำเสมอ เงาบัง หรือแสงสะท้อนบนหน้าจอมือถือและกระดาษมัน
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
 * ขั้นตอนที่ 4: กลับสีพิกเซลบัฟเฟอร์ (Invert) สำหรับ QR Code แบบสว่างบนพื้นหลังมืด
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
 * ฟังก์ชันหลักรวมศูนย์สำหรับการประมวลผลพิกเซลบัฟเฟอร์ตามโหมดที่เลือก
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
/* ตัวถอดรหัสภาพผ่าน Canvas แบบหลายรอบ (Multi-Pass) สำหรับวิดีโอสดและไฟล์อัปโหลด  */
/* ========================================================================== */

/**
 * วาดภาพหรือเฟรมวิดีโอต้นทางลงบน Canvas พร้อมรองรับการครอปขยายตรงกลางและการหมุนภาพ
 * จากนั้นนำฟิลเตอร์ประมวลผลพิกเซลที่ต้องการมาปรับแต่งภาพ
 */
export function renderPreprocessedCanvas(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  sourceWidth: number,
  sourceHeight: number,
  options: {
    cropRatio?: number; // 1.0 = เต็มเฟรม, 0.65 = ครอปขยายตรงกลาง, 0.45 = ครอปเจาะจงเฉพาะจุดกึ่งกลาง
    angleDeg?: number;  // องศาการหมุนภาพ เช่น 0, -15, 15 องศา
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

  // เติมพื้นหลังสีขาวรองรับส่วนขอบที่มีการหมุนภาพ
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
 * พยายามถอดรหัส QR Code จากอิลิเมนต์ Canvas ด้วย Native BarcodeDetector (GPU เร่งความเร็ว)
 * หากไม่สำเร็จจะสลับไปใช้ตัวถอดรหัสของ QrScanner (WebAssembly / Web Worker)
 */
async function decodeCanvasElement(
  canvas: HTMLCanvasElement,
): Promise<string | null> {
  // 1. ลองใช้ Native BarcodeDetector เป็นลำดับแรก (ประมวลผลผ่าน GPU โดยตรง รวดเร็วมาก)
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const Detector = (window as any).BarcodeDetector;
      const detector = new Detector({ formats: ['qr_code'] });
      const results = await detector.detect(canvas);
      if (Array.isArray(results) && results.length > 0 && results[0]?.rawValue) {
        return String(results[0].rawValue).trim();
      }
    } catch {
      // หากไม่พบ ให้สลับไปใช้ตัวถอดรหัสของ QrScanner ต่อไป
    }
  }

  // 2. ตัวถอดรหัสสำรอง QrScanner.scanImage (Nimiq WebAssembly / Worker)
  try {
    const QrScanner = (await import('qr-scanner')).default;
    const res = await QrScanner.scanImage(canvas, {
      alsoTryWithoutScanRegion: true,
      returnDetailedScanResult: true,
    });
    const text = typeof res === 'object' && res?.data ? res.data : String(res || '');
    if (text && text.trim()) {
      return text.trim();
    }
  } catch {
    // ละเว้นข้อผิดพลาดหากไม่พบรหัสในรอบนี้
  }

  return null;
}

/**
 * ตัวถอดรหัสสำรองแบบหลายรอบสำหรับแท็ก <video> สด
 * ทำงานเมื่อการสแกนเฟรมปกติยังตรวจไม่พบ QR Code ที่เบลอ อยู่ไกล แสงน้อย หรือวางเอียง
 */
export async function tryEnhancedVideoFrameDecode(
  target: string | HTMLVideoElement | null = 'qr-reader',
  passIndex = 0,
): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  let video: HTMLVideoElement | null = null;
  if (typeof target === 'string') {
    const container = document.getElementById(target);
    video = container instanceof HTMLVideoElement ? container : (container?.querySelector('video') as HTMLVideoElement | null);
  } else if (target instanceof HTMLVideoElement) {
    video = target;
  }
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return null;
  }

  // สลับรอบการประมวลผลภาพในแต่ละรอบเพื่อรักษาความลื่นไหลของหน้าจอที่ 60fps
  const passes: Array<{
    cropRatio: number;
    angleDeg: number;
    mode: PreprocessMode;
  }> = [
    { cropRatio: 0.85, angleDeg: 0, mode: 'contrast_sharpen' },
    { cropRatio: 0.58, angleDeg: 0, mode: 'contrast_sharpen' }, // QR ขนาดเล็กหรืออยู่ไกล
    { cropRatio: 0.85, angleDeg: 0, mode: 'adaptive_threshold' }, // ในที่แสงน้อยหรือมีแสงสะท้อน
    { cropRatio: 0.42, angleDeg: 0, mode: 'contrast_sharpen' }, // QR ขนาดเล็กมาก
    { cropRatio: 0.8, angleDeg: 15, mode: 'contrast_sharpen' }, // QR วางเอียงขวา (+15 องศา)
    { cropRatio: 0.8, angleDeg: -15, mode: 'contrast_sharpen' }, // QR วางเอียงซ้าย (-15 องศา)
    { cropRatio: 0.55, angleDeg: 0, mode: 'adaptive_threshold' }, // อยู่ไกล + แสงน้อย
    { cropRatio: 0.85, angleDeg: 0, mode: 'invert' }, // QR แบบกลับสี (สว่างบนพื้นมืด)
  ];

  const chosen = passes[passIndex % passes.length];
  const canvas = renderPreprocessedCanvas(
    video,
    video.videoWidth,
    video.videoHeight,
    chosen,
  );
  if (!canvas) return null;

  return decodeCanvasElement(canvas);
}

/**
 * ตัวถอดรหัสแบบหลายรอบสำหรับไฟล์รูปภาพที่อัปโหลด
 * เริ่มต้นด้วยการสแกนตรง หากไม่พบจะทำการครอปหลายระยะ ปรับความคมชัด ปรับแสง และหมุนภาพอย่างเป็นระบบ
 */
export async function decodeUploadedQrImageFile(
  file: File,
  _hiddenElementId = 'qr-reader-hidden',
): Promise<string> {
  const QrScanner = (await import('qr-scanner')).default;

  // รอบที่ 0: สแกนโดยตรงด้วย QrScanner ทันที
  try {
    const res = await QrScanner.scanImage(file, {
      alsoTryWithoutScanRegion: true,
      returnDetailedScanResult: true,
    });
    const text = typeof res === 'object' && res?.data ? res.data : String(res || '');
    if (text && text.trim()) return text.trim();
  } catch {
    // หากสแกนตรงไม่พบ ให้ดำเนินการต่อด้วยฟิลเตอร์ปรับแต่งภาพขั้นสูง
  }

  // โหลดรูปภาพเข้าสู่อิลิเมนต์ HTMLImageElement เพื่อนำมาประมวลผล
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
      const decoded = await decodeCanvasElement(canvas);
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
 * สร้างข้อความแนะนำเป็นภาษาไทยตามสถานการณ์จริงเมื่อการสแกนใช้เวลามากกว่าปกติ
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

