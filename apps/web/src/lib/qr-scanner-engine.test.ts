import { describe, expect, it } from 'vitest';
import {
  adaptiveThresholdPixelBuffer,
  computeResponsiveQrBox,
  getScannerGuidanceMessage,
  grayscaleAndContrastStretch,
  invertPixelBuffer,
  preprocessPixelBuffer,
  QrDuplicateGuard,
  sharpenPixelBuffer,
} from './qr-scanner-engine';

describe('QR Scanner Engine Unit Tests', () => {
  describe('QrDuplicateGuard (Duplicate Scan & Cooldown Protection)', () => {
    it('allows first scan and blocks concurrent scans while in-flight', () => {
      const guard = new QrDuplicateGuard(4000);
      expect(guard.tryAcquire('BK-2569-0001', 1000)).toBe(true);
      expect(guard.isLocked()).toBe(true);

      // Concurrent scan while in-flight is blocked even with a different token
      expect(guard.tryAcquire('BK-2569-0002', 1100)).toBe(false);

      guard.release(1500);
      expect(guard.isLocked()).toBe(false);
    });

    it('blocks duplicate token within cooldown window and allows after cooldown expires', () => {
      const guard = new QrDuplicateGuard(4000);
      expect(guard.tryAcquire('BK-2569-0001', 1000)).toBe(true);
      guard.release(1200);

      // Same token within 4000ms cooldown is rejected
      expect(guard.tryAcquire('BK-2569-0001', 3500)).toBe(false);

      // Different token within cooldown is allowed immediately
      expect(guard.tryAcquire('BK-2569-0002', 3600)).toBe(true);
      guard.release(3800);

      // Same token after 4000ms cooldown is allowed again
      expect(guard.tryAcquire('BK-2569-0002', 8000)).toBe(true);
    });
  });

  describe('computeResponsiveQrBox()', () => {
    it('computes 80% of shorter dimension clamped between 200 and 420', () => {
      expect(computeResponsiveQrBox(400, 400)).toEqual({ width: 320, height: 320 });
      expect(computeResponsiveQrBox(200, 200)).toEqual({ width: 200, height: 200 });
      expect(computeResponsiveQrBox(800, 600)).toEqual({ width: 420, height: 420 });
    });
  });

  describe('Multi-Pass Pixel Preprocessing Filters (Low-Light, Blurry, Glare, Inverted)', () => {
    const createLowContrastSample = (width = 8, height = 8): Uint8ClampedArray => {
      const buf = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          // Low-contrast gray values (100 vs 140) simulating dim/washed-out QR modules
          const v = (x + y) % 2 === 0 ? 100 : 140;
          buf[idx] = v;
          buf[idx + 1] = v;
          buf[idx + 2] = v;
          buf[idx + 3] = 255;
        }
      }
      return buf;
    };

    it('stretches low-contrast image to full 0-255 dynamic range', () => {
      const sample = createLowContrastSample(8, 8);
      const stretched = grayscaleAndContrastStretch(sample, 8, 8);
      expect(stretched[0]).toBe(0);
      expect(stretched[4]).toBe(255);
    });

    it('applies 3x3 sharpening convolution kernel to enhance blurry edges', () => {
      const sample = createLowContrastSample(8, 8);
      const sharpened = sharpenPixelBuffer(sample, 8, 8);
      expect(sharpened.length).toBe(sample.length);
      expect(sharpened[0]).toBe(0);
      expect(sharpened[4]).toBe(255);
    });

    it('applies integral-image adaptive thresholding to binarize uneven lighting into 0 or 255', () => {
      const sample = createLowContrastSample(12, 12);
      const binarized = adaptiveThresholdPixelBuffer(sample, 12, 12);
      for (let i = 0; i < binarized.length; i += 4) {
        expect([0, 255]).toContain(binarized[i]);
        expect(binarized[i + 3]).toBe(255);
      }
    });

    it('inverts luminance for light-on-dark QR codes', () => {
      const sample = createLowContrastSample(4, 4);
      const inverted = invertPixelBuffer(sample, 4, 4);
      expect(inverted[0]).toBe(255);
      expect(inverted[4]).toBe(0);
    });

    it('dispatches preprocessPixelBuffer modes accurately', () => {
      const sample = createLowContrastSample(6, 6);
      expect(preprocessPixelBuffer(sample, 6, 6, 'normal').length).toBe(sample.length);
      expect(preprocessPixelBuffer(sample, 6, 6, 'contrast_sharpen').length).toBe(sample.length);
      expect(preprocessPixelBuffer(sample, 6, 6, 'adaptive_threshold').length).toBe(sample.length);
      expect(preprocessPixelBuffer(sample, 6, 6, 'invert').length).toBe(sample.length);
    });
  });

  describe('getScannerGuidanceMessage()', () => {
    it('provides progressive guidance messages based on elapsed time and zoom/torch state', () => {
      expect(getScannerGuidanceMessage(1, 1.0, false, false)).toContain('อัตโนมัติ');
      expect(getScannerGuidanceMessage(4, 1.0, false, false)).toContain('แถบซูม');
      expect(getScannerGuidanceMessage(8, 1.5, false, true)).toContain('เปิดไฟฉาย');
      expect(getScannerGuidanceMessage(12, 2.0, true, true)).toContain('แตะที่หน้าจอกล้องเพื่อโฟกัสใหม่');
    });
  });
});

