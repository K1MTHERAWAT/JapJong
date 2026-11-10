/**
 * ชุดการทดสอบการทำงานของ QR Scanner Engine (Unit Tests)
 * ครอบคลุม:
 * 1. ระบบป้องกันการสแกนซ้ำและคูลดาวน์ (QrDuplicateGuard)
 * 2. การคำนวณขนาดกรอบสแกนที่ยืดหยุ่นตามหน้าจอ (computeResponsiveQrBox)
 * 3. อัลกอริทึมประมวลผลพิกเซล (Contrast Stretch, Sharpen 3x3, Adaptive Threshold, Invert)
 * 4. ระบบสร้างข้อความแนะนำอัจฉริยะตามสถานการณ์จริง (getScannerGuidanceMessage)
 */
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
  describe('QrDuplicateGuard (ระบบป้องกันการสแกนซ้ำซ้อนและล็อกคำขอที่กำลังส่ง)', () => {
    it('อนุญาตให้สแกนครั้งแรก และบล็อกการสแกนซ้อนขณะที่คำขอกำลังส่งอยู่ (In-Flight)', () => {
      const guard = new QrDuplicateGuard(4000);
      expect(guard.tryAcquire('BK-2569-0001', 1000)).toBe(true);
      expect(guard.isLocked()).toBe(true);

      // บล็อกการสแกนซ้ำขณะที่ส่งคำขออยู่ แม้ว่าจะเป็นโทเค็นอื่นก็ตาม
      expect(guard.tryAcquire('BK-2569-0002', 1100)).toBe(false);

      guard.release(1500);
      expect(guard.isLocked()).toBe(false);
    });

    it('บล็อกรหัสเดิมที่สแกนซ้ำภายในช่วงเวลาคูลดาวน์ และอนุญาตใหม่เมื่อพ้นกำหนดคูลดาวน์', () => {
      const guard = new QrDuplicateGuard(4000);
      expect(guard.tryAcquire('BK-2569-0001', 1000)).toBe(true);
      guard.release(1200);

      // ไม่อนุญาตโทเค็นเดิมหากยังไม่พ้นคูลดาวน์ 4000ms
      expect(guard.tryAcquire('BK-2569-0001', 3500)).toBe(false);

      // อนุญาตโทเค็นใหม่ที่ต่างออกไปได้ทันที
      expect(guard.tryAcquire('BK-2569-0002', 3600)).toBe(true);
      guard.release(3800);

      // อนุญาตโทเค็นเดิมได้อีกครั้งเมื่อพ้นระยะเวลาคูลดาวน์แล้ว
      expect(guard.tryAcquire('BK-2569-0002', 8000)).toBe(true);
    });
  });

  describe('computeResponsiveQrBox() (การคำนวณขนาดกรอบสแกน)', () => {
    it('คำนวณขนาด 80% ของด้านที่สั้นกว่า และจำกัดขนาดไว้ระหว่าง 200 ถึง 420 พิกเซล', () => {
      expect(computeResponsiveQrBox(400, 400)).toEqual({ width: 320, height: 320 });
      expect(computeResponsiveQrBox(200, 200)).toEqual({ width: 200, height: 200 });
      expect(computeResponsiveQrBox(800, 600)).toEqual({ width: 420, height: 420 });
    });
  });

  describe('Multi-Pass Pixel Preprocessing Filters (ฟิลเตอร์ประมวลผลภาพ)', () => {
    // สร้างตัวอย่างพิกเซลที่มีความเปรียบต่างต่ำ (ค่าเทา 100 เทียบกับ 140) จำลอง QR Code ที่ซีดจางหรือแสงน้อย
    const createLowContrastSample = (width = 8, height = 8): Uint8ClampedArray => {
      const buf = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const v = (x + y) % 2 === 0 ? 100 : 140;
          buf[idx] = v;
          buf[idx + 1] = v;
          buf[idx + 2] = v;
          buf[idx + 3] = 255;
        }
      }
      return buf;
    };

    it('ยืดช่วงความเปรียบต่างของภาพ (Contrast Stretch) ให้ครอบคลุมช่วง 0-255 เต็มไดนามิก', () => {
      const sample = createLowContrastSample(8, 8);
      const stretched = grayscaleAndContrastStretch(sample, 8, 8);
      expect(stretched[0]).toBe(0);
      expect(stretched[4]).toBe(255);
    });

    it('ใช้ฟิลเตอร์คอนโวลูชันเพิ่มความคมชัดขนาด 3x3 เพื่อเพิ่มความชัดของขอบภาพที่เบลอ', () => {
      const sample = createLowContrastSample(8, 8);
      const sharpened = sharpenPixelBuffer(sample, 8, 8);
      expect(sharpened.length).toBe(sample.length);
      expect(sharpened[0]).toBe(0);
      expect(sharpened[4]).toBe(255);
    });

    it('ใช้อัลกอริทึม Adaptive Thresholding ผ่าน Integral Image แปลงภาพเป็นขาว-ดำ (0 หรือ 255) ตามสภาพแสงรอบข้าง', () => {
      const sample = createLowContrastSample(12, 12);
      const binarized = adaptiveThresholdPixelBuffer(sample, 12, 12);
      for (let i = 0; i < binarized.length; i += 4) {
        expect([0, 255]).toContain(binarized[i]);
        expect(binarized[i + 3]).toBe(255);
      }
    });

    it('กลับค่าสีความสว่าง (Invert) สำหรับ QR Code แบบสว่างบนพื้นหลังมืด', () => {
      const sample = createLowContrastSample(4, 4);
      const inverted = invertPixelBuffer(sample, 4, 4);
      expect(inverted[0]).toBe(255);
      expect(inverted[4]).toBe(0);
    });

    it('เลือกโหมดการประมวลผลพิกเซล (preprocessPixelBuffer) ได้อย่างถูกต้องแม่นยำ', () => {
      const sample = createLowContrastSample(6, 6);
      expect(preprocessPixelBuffer(sample, 6, 6, 'normal').length).toBe(sample.length);
      expect(preprocessPixelBuffer(sample, 6, 6, 'contrast_sharpen').length).toBe(sample.length);
      expect(preprocessPixelBuffer(sample, 6, 6, 'adaptive_threshold').length).toBe(sample.length);
      expect(preprocessPixelBuffer(sample, 6, 6, 'invert').length).toBe(sample.length);
    });
  });

  describe('getScannerGuidanceMessage() (ข้อความแนะนำอัจฉริยะ)', () => {
    it('แสดงข้อความแนะนำตามระยะเวลาการสแกนและสถานะการซูม/ไฟฉายตามลำดับอย่างถูกต้อง', () => {
      expect(getScannerGuidanceMessage(1, 1.0, false, false)).toContain('อัตโนมัติ');
      expect(getScannerGuidanceMessage(4, 1.0, false, false)).toContain('แถบซูม');
      expect(getScannerGuidanceMessage(8, 1.5, false, true)).toContain('เปิดไฟฉาย');
      expect(getScannerGuidanceMessage(12, 2.0, true, true)).toContain('แตะที่หน้าจอกล้องเพื่อโฟกัสใหม่');
    });
  });
});

