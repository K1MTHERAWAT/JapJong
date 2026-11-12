/**
 * หน้าตรวจสอบความถูกต้องของเอกสารทางราชการสำหรับเจ้าหน้าที่ (Staff Document Verification)
 * 
 * ฟังก์ชันการทำงานหลัก:
 * 1. ระบบสแกน QR Code ผ่านกล้องสด (WebRTC & QrScanner)
 *    - ระบบประมวลผลภาพขั้นสูงในพื้นหลัง (Multi-pass Preprocessing): ปรับคอนทราสต์, เพิ่มความคมชัด (Sharpen 3x3),
 *      ปรับระดับแสงแบบปรับตัวตามพื้นที่ (Adaptive Threshold) และกลับสี (Invert) สำหรับภาพเบลอ หลุดโฟกัส หรือแสงน้อย
 *    - ระบบควบคุมกล้อง: ซูมฮาร์ดแวร์/ดิจิทัล (1x - 3x), เปิด/ปิดไฟฉาย (Torch), แตะหน้าจอเพื่อโฟกัสใหม่ (Continuous Focus)
 *    - สลับกล้องหน้า/หลังอัตโนมัติ พร้อมตรวจจับความพร้อมใช้งานของฮาร์ดแวร์
 *    - ข้อความแนะนำอัจฉริยะแบบเรียลไทม์ตามระยะเวลาที่สแกน
 * 2. โหมดอัปโหลดรูปภาพ (Upload QR Image File)
 *    - หมุนภาพ ชดเชยองศาเอียง และประมวลผลหลายระดับอัตโนมัติหากภาพไม่ชัด
 * 3. โหมดพิมพ์ค้นหาด้วยเลขที่เอกสารหรือรหัสยืนยัน (Manual Query)
 * 4. ระบบป้องกันการสแกนซ้ำซ้อน (QrDuplicateGuard) ป้องกันการส่งคำขอซ้ำระหว่างรอผลหรือในระยะคูลดาวน์
 * 5. โหมดสแกนต่อเนื่อง (Continuous Mode) สำหรับการตรวจเอกสารหลายฉบับติดต่อกันโดยไม่ต้องเปิดกล้องใหม่
 * 6. แสดงผลการตรวจสอบอย่างเป็นทางการ:
 *    - ข้อมูลคำขอ, ผู้ยื่น, วัตถุประสงค์, วันที่ออก, สถานะเอกสาร
 *    - ลายมือชื่อและการอนุมัติดิจิทัลครบทั้ง 3 ระดับ (ผู้ตรวจทาน -> นิติกร -> นายก อบต.)
 *    - รหัสลายพิมพ์ดิจิทัล SHA-256 Hash พร้อมปุ่มคัดลอก
 *    - บันทึกและแสดงประวัติการสแกนล่าสุดของเจ้าหน้าที่
 */
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  DocumentScanLog,
  RequestStatus,
  STATUS_META,
  StaffVerificationResult,
  VERIFICATION_DOC_TYPE_LABEL,
  VERIFICATION_STATUS_LABEL,
  VERIFICATION_STATUS_TONE,
} from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip } from '@/components/ui';
import { api, formatThaiDateTime } from '@/lib/api';
import {
  applyCameraTorch,
  applyCameraZoom,
  CameraHardwareCapabilities,
  computeResponsiveQrBox,
   decodeUploadedQrImageFile,
  DEFAULT_CAMERA_CAPABILITIES,
  getActiveVideoTrack,
  getOptimalVideoConstraints,
  getScannerGuidanceMessage,
  inspectTrackCapabilities,
  QrDuplicateGuard,
  triggerCameraRefocus,
  tryEnhancedVideoFrameDecode,
} from '@/lib/qr-scanner-engine';

export default function StaffVerifyPage() {
  const { account } = useAuth();
  const [mode, setMode] = useState<'camera' | 'upload' | 'manual'>('camera');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualQuery, setManualQuery] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<StaffVerificationResult | null>(null);
  const [history, setHistory] = useState<DocumentScanLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // สถานะระบบควบคุมกล้องขั้นสูง (ซูม, ไฟฉาย, กล้องที่เลือก, โหมดสแกนต่อเนื่อง)
  const [continuousMode, setContinuousMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [usingDigitalZoom, setUsingDigitalZoom] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [capabilities, setCapabilities] = useState<CameraHardwareCapabilities>(
    DEFAULT_CAMERA_CAPABILITIES,
  );
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [scanElapsedSec, setScanElapsedSec] = useState(0);
  const [enhancePassCount, setEnhancePassCount] = useState(0);
  const [lastScannedBanner, setLastScannedBanner] = useState('');
  const [copiedHash, setCopiedHash] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const qrScannerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const duplicateGuardRef = useRef<QrDuplicateGuard>(new QrDuplicateGuard(4000));
  const continuousModeRef = useRef<boolean>(continuousMode);
  continuousModeRef.current = continuousMode;

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    api
      .staffVerifyHistory(20)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const stopCamera = useCallback(async () => {
    if (qrScannerRef.current) {
      try {
        qrScannerRef.current.stop();
        qrScannerRef.current.destroy();
      } catch {
        // ละเว้นข้อผิดพลาดขณะหยุดกล้อง
      }
      qrScannerRef.current = null;
    }
    setScanning(false);
    setTorchOn(false);
    setScanElapsedSec(0);
  }, []);

  // ประมวลผลการตรวจสอบพร้อมป้องกันการสแกนซ้ำซ้อน
  const handleVerify = useCallback(
    async (queryText: string, fromCamera = false) => {
      const cleaned = (queryText || '').trim();
      if (!cleaned) return;

      if (fromCamera) {
        const acquired = duplicateGuardRef.current.tryAcquire(cleaned);
        if (!acquired) return;
      }

      if (fromCamera && !continuousModeRef.current) {
        await stopCamera();
      }

      setVerifying(true);
      setLastScannedBanner(`ตรวจพบรหัส: ${cleaned.slice(0, 32)}${cleaned.length > 32 ? '...' : ''}`);
      try {
        const res = await api.staffVerify(cleaned);
        setResult(res);
        loadHistory();
      } catch {
        setResult({
          status: 'INVALID',
          message: 'เกิดข้อผิดพลาดในการตรวจสอบเอกสาร',
        });
      } finally {
        setVerifying(false);
        duplicateGuardRef.current.release();
      }
    },
    [loadHistory, stopCamera],
  );

  const startCamera = useCallback(async (targetCamId?: string) => {
    setCameraError('');
    setScanning(true);
    setScanElapsedSec(0);
    setEnhancePassCount(0);

    try {
      // 1. ตรวจสอบความปลอดภัย Secure Context (เบราว์เซอร์ไม่อนุญาตให้เปิดกล้องผ่าน HTTP บน IP ภายนอก)
      if (typeof window !== 'undefined') {
        if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          throw new Error('SECURE_CONTEXT_REQUIRED');
        }
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('MEDIA_DEVICES_NOT_SUPPORTED');
        }
      }

      const QrScanner = (await import('qr-scanner')).default;

      // เคลียร์ scanner เดิมหากมี
      await stopCamera();

      // รอ DOM mount เล็กน้อยเพื่อให้ videoRef พร้อมใช้งาน
      if (!videoRef.current) {
        await new Promise((r) => setTimeout(r, 60));
      }
      const videoEl = videoRef.current;
      if (!videoEl) {
        throw new Error('CONTAINER_NOT_FOUND');
      }

      // ค้นหารายการกล้องทั้งหมดบนอุปกรณ์ด้วย QrScanner
      let cameras: Array<{ id: string; label: string }> = [];
      try {
        cameras = await QrScanner.listCameras(true);
      } catch (e) {
        console.warn('Could not enumerate cameras:', e);
      }
      setAvailableCameras(cameras);

      const activeCamId = targetCamId || selectedCameraId;
      const backCam = cameras.find((c) =>
        /back|rear|environment|หลัง|world/i.test(c.label),
      );
      const preferredCamId = activeCamId || (backCam ? backCam.id : cameras[0]?.id);

      const scanner = new QrScanner(
        videoEl,
        (result) => {
          const text = typeof result === 'object' && result?.data ? result.data : String(result || '');
          if (text) {
            handleVerify(text, true);
          }
        },
        {
          onDecodeError: () => {},
          preferredCamera: preferredCamId || 'environment',
          maxScansPerSecond: 25,
          highlightScanRegion: false,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
        },
      );

      // ตรวจจับทั้ง QR ขาว-ดำปกติ และแบบ Invert (ขาวบนพื้นดำ)
      scanner.setInversionMode('both');

      await scanner.start();
      qrScannerRef.current = scanner;

      if (preferredCamId && !selectedCameraId) {
        setSelectedCameraId(preferredCamId);
      }

      setScanning(true);

      // ตรวจสอบความสามารถของกล้อง (Hardware Zoom, Torch, Continuous Focus)
      setTimeout(() => {
        const track = getActiveVideoTrack(videoEl);
        const caps = inspectTrackCapabilities(track);
        setCapabilities(caps);
        triggerCameraRefocus(track);
      }, 450);
    } catch (err: any) {
      console.error('Camera start error:', err);
      const errMsg = err?.message || '';
      const errName = err?.name || '';

      if (errMsg === 'SECURE_CONTEXT_REQUIRED' || (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost')) {
        setCameraError(
          'ความปลอดภัยของเบราว์เซอร์: การเปิดกล้องบนมือถือผ่าน HTTP บน IP เครือข่าย (เช่น http://192.168.x.x:3000) ถูกจำกัดโดยระบบปฏิบัติการมือถือ (ต้องใช้ผ่าน HTTPS หรือ localhost) แนะนำให้ใช้ปุ่ม "อัปโหลดภาพ QR" หรือ "พิมพ์ค้นหา" ด้านบนแทนได้ทันทีครับ',
        );
      } else if (errName === 'NotAllowedError' || errMsg.includes('NotAllowedError') || errName === 'PermissionDeniedError') {
        setCameraError(
          'เบราว์เซอร์ถูกปฏิเสธการเข้าถึงกล้อง: กรุณากดที่ไอคอนกุญแจ/การตั้งค่าเว็บตรงแถบ URL ด้านบน แล้วเลือก "อนุญาต (Allow)" ให้เข้าถึงกล้อง แล้วกดปุ่มลองใหม่อีกครั้ง',
        );
      } else if (errName === 'NotFoundError' || errMsg.includes('NotFoundError') || errMsg === 'NO_CAMERA_FOUND') {
        setCameraError(
          'ไม่พบอุปกรณ์กล้องบนเครื่องนี้: หากใช้คอมพิวเตอร์ตั้งโต๊ะ กรุณาเชื่อมต่อเว็บแคม หรือใช้วิธีอัปโหลดรูปภาพ / พิมพ์รหัสเอกสารแทน',
        );
      } else if (errName === 'NotReadableError' || errMsg.includes('NotReadableError') || errName === 'TrackStartError') {
        setCameraError(
          'กล้องกำลังถูกใช้งานโดยแอปพลิเคชันอื่น: กรุณาปิดโปรแกรมอื่นที่เปิดกล้องค้างไว้ (เช่น Zoom, Google Meet, Teams) แล้วกดลองใหม่อีกครั้ง',
        );
      } else {
        setCameraError(
          `ไม่สามารถเปิดกล้องได้ (${errName || 'Error'}: ${errMsg || 'อุปกรณ์ไม่รองรับ'}) กรุณาลองใหม่อีกครั้ง หรือสลับไปใช้วิธีอัปโหลดรูปภาพ`,
        );
      }
      setScanning(false);
    }
  }, [handleVerify, selectedCameraId, stopCamera]);

  const handleSwitchCamera = useCallback(async () => {
    if (availableCameras.length <= 1) return;
    const currentIdx = availableCameras.findIndex((c) => c.id === selectedCameraId);
    const nextIdx = (currentIdx + 1) % availableCameras.length;
    const nextCam = availableCameras[nextIdx];
    setSelectedCameraId(nextCam.id);
    if (qrScannerRef.current?.setCamera) {
      try {
        await qrScannerRef.current.setCamera(nextCam.id);
        const track = getActiveVideoTrack(videoRef.current);
        const caps = inspectTrackCapabilities(track);
        setCapabilities(caps);
        return;
      } catch (err) {
        console.warn('สลับกล้องด่วนไม่สำเร็จ กำลังรีสตาร์ทตัวสแกนใหม่...', err);
      }
    }
    await startCamera(nextCam.id);
  }, [availableCameras, selectedCameraId, startCamera]);

  // จัดการเปิด/ปิดกล้องตาม mode และสถานะการสแกนต่อเนื่อง
  useEffect(() => {
    const shouldRunCamera =
      mode === 'camera' && (!result || continuousMode);
    if (shouldRunCamera && !qrScannerRef.current) {
      startCamera();
    } else if (!shouldRunCamera && qrScannerRef.current) {
      stopCamera();
    }
  }, [mode, result, continuousMode, startCamera, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // ลูปประมวลผลภาพขั้นสูงในพื้นหลัง (Multi-Pass Image Preprocessing) สำหรับกรณีภาพเบลอ / อยู่ไกล / แสงน้อย / วางเอียง
  useEffect(() => {
    if (!scanning || mode !== 'camera') return;

    let passIdx = 0;
    let active = true;

    const elapsedTimer = setInterval(() => {
      setScanElapsedSec((prev) => prev + 1);
    }, 1000);

    const enhanceTimer = setInterval(async () => {
      if (!active || duplicateGuardRef.current.isLocked()) return;
      const currentPass = passIdx++;
      setEnhancePassCount(currentPass + 1);

      // ทุกๆ 6 รอบ ให้กระตุ้น Continuous Focus ใหม่อัตโนมัติ
      if (currentPass % 6 === 0) {
        const track = getActiveVideoTrack(videoRef.current || 'qr-reader');
        triggerCameraRefocus(track);
      }

      const decoded = await tryEnhancedVideoFrameDecode(videoRef.current || 'qr-reader', currentPass);
      if (active && decoded) {
        handleVerify(decoded, true);
      }
    }, 650);

    return () => {
      active = false;
      clearInterval(elapsedTimer);
      clearInterval(enhanceTimer);
    };
  }, [scanning, mode, handleVerify]);

  // ปรับระดับการซูม (Hardware Zoom หรือ Digital Zoom Fallback)
  const handleZoomChange = async (newZoom: number) => {
    const clamped = Math.round(Math.max(1, Math.min(3, newZoom)) * 10) / 10;
    setZoomLevel(clamped);
    const track = getActiveVideoTrack(videoRef.current || 'qr-reader');
    const appliedHardware = await applyCameraZoom(track, clamped, capabilities);
    setUsingDigitalZoom(!appliedHardware && clamped > 1);
  };

  // เปิด/ปิดไฟฉาย (Torch)
  const handleToggleTorch = async () => {
    if (qrScannerRef.current?.hasFlash && qrScannerRef.current.hasFlash()) {
      try {
        await qrScannerRef.current.toggleFlash();
        setTorchOn(Boolean(qrScannerRef.current.isFlashOn()));
        return;
      } catch {
        // หากสั่งผ่านตัวสแกนไม่ได้ ให้สั่งตรงที่แทร็ก MediaStreamTrack
      }
    }
    const track = getActiveVideoTrack(videoRef.current || 'qr-reader');
    const nextState = !torchOn;
    const ok = await applyCameraTorch(track, nextState);
    if (ok) {
      setTorchOn(nextState);
    }
  };

  // แตะเพื่อโฟกัสใหม่
  const handleManualRefocus = async () => {
    const track = getActiveVideoTrack(videoRef.current || 'qr-reader');
    await triggerCameraRefocus(track);
    setScanElapsedSec(0);
  };

  // ตรวจสอบจากไฟล์รูปภาพด้วย Multi-pass Preprocessing
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVerifying(true);
    setCameraError('');

    try {
      const decodedText = await decodeUploadedQrImageFile(
        file,
        'qr-reader-hidden',
      );
      await handleVerify(decodedText, false);
    } catch {
      setCameraError(
        'ไม่พบ QR Code ในรูปภาพที่อัปโหลด (ระบบได้ทดลองปรับความคมชัด ขยายภาพ และหมุนองศาแล้ว) กรุณาถ่ายภาพให้เห็นกรอบ QR Code ครบถ้วน',
      );
      setVerifying(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleResetScan = () => {
    duplicateGuardRef.current.reset();
    setResult(null);
    setManualQuery('');
    setCameraError('');
    setLastScannedBanner('');
    setScanElapsedSec(0);
    if (mode === 'camera' && !qrScannerRef.current) {
      startCamera();
    }
  };

  const status = result?.status || 'NOT_FOUND';
  const tone = VERIFICATION_STATUS_TONE[status];
  const guidanceText = getScannerGuidanceMessage(
    scanElapsedSec,
    zoomLevel,
    torchOn,
    capabilities.supportsTorch,
  );

  return (
    <AppShell
      title="ตรวจสอบเอกสาร QR Code"
      backHref="/staff"
      maxWidth="max-w-[760px]"
    >
      <div className="flex flex-col gap-5">
        {/* แถบโหมดการสแกน (แสดงเสมอเมื่อยังไม่พบผลลัพธ์ หรือเมื่อเปิดโหมดสแกนต่อเนื่อง) */}
        {(!result || continuousMode) && (
          <div className="jw-card p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <b className="text-[16px] text-ink block">สแกนตรวจสอบเอกสารทางราชการ</b>
                <span className="text-[12.5px] text-ink-mute">
                  ตรวจความถูกต้อง ลายมือชื่อ และสถานะการอนุญาตของเอกสาร อบต. (รองรับภาพเบลอ อยู่ไกล แสงน้อย หรือเอียง)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setContinuousMode((v) => !v)}
                  className={`h-8 px-3 rounded-full border text-[12px] font-semibold flex items-center gap-1.5 transition ${
                    continuousMode
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white text-ink-mute border-line hover:border-brand'
                  }`}
                  title="เปิดกล้องค้างไว้เพื่อสแกนเอกสารหลายใบต่อเนื่องโดยไม่ต้องเปิดกล้องใหม่"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      continuousMode ? 'bg-white animate-ping' : 'bg-ink-mute/50'
                    }`}
                  />
                  สแกนต่อเนื่อง: {continuousMode ? 'เปิด' : 'ปิด'}
                </button>
                <Chip tone="blue">เจ้าหน้าที่: {account?.name}</Chip>
              </div>
            </div>

            {/* ปุ่มสลับโหมด */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode('camera')}
                className={`py-2.5 px-3 rounded-xl border text-[13px] font-semibold flex items-center justify-center gap-2 transition ${
                  mode === 'camera'
                    ? 'bg-brand text-white border-brand shadow-xs'
                    : 'bg-white text-ink border-line hover:bg-soft'
                }`}
              >
                <Icon name="photo" className="w-4 h-4" />
                กล้องถ่ายรูป
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('upload');
                  fileInputRef.current?.click();
                }}
                className={`py-2.5 px-3 rounded-xl border text-[13px] font-semibold flex items-center justify-center gap-2 transition ${
                  mode === 'upload'
                    ? 'bg-brand text-white border-brand shadow-xs'
                    : 'bg-white text-ink border-line hover:bg-soft'
                }`}
              >
                <Icon name="upload" className="w-4 h-4" />
                อัปโหลดรูป QR
              </button>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setMode('manual');
                }}
                className={`py-2.5 px-3 rounded-xl border text-[13px] font-semibold flex items-center justify-center gap-2 transition ${
                  mode === 'manual'
                    ? 'bg-brand text-white border-brand shadow-xs'
                    : 'bg-white text-ink border-line hover:bg-soft'
                }`}
              >
                <Icon name="file-text" className="w-4 h-4" />
                พิมพ์เลขที่เอกสาร
              </button>
            </div>

            {/* ช่อง Input ซ่อนสำหรับ Upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* กล่องแสดงกล้องสแกนพร้อมระบบ Zoom / Torch / Auto-Focus / AI Preprocessing */}
            {mode === 'camera' && (
              <div className="flex flex-col items-center gap-3.5">
                <div
                  onClick={handleManualRefocus}
                  title="แตะที่ภาพเพื่อปรับโฟกัสอัตโนมัติใหม่"
                  className="relative w-full max-w-[420px] aspect-square rounded-2xl overflow-hidden bg-black/95 border-2 border-brand/60 shadow-md flex items-center justify-center cursor-pointer"
                >
                  <div
                    id="qr-reader"
                    className="w-full h-full relative overflow-hidden transition-transform duration-200 ease-out"
                    style={
                      usingDigitalZoom && zoomLevel > 1
                        ? {
                            transform: `scale(${zoomLevel})`,
                            transformOrigin: 'center center',
                          }
                        : undefined
                    }
                  >
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      playsInline
                      muted
                    />
                  </div>

                  {/* กรอบเล็งสแกนขนาดใหญ่ รองรับ QR Code เอียงหรืออยู่ห่าง */}
                  <div className="absolute inset-6 pointer-events-none border-2 border-brand/70 rounded-2xl flex flex-col justify-between p-3">
                    <div className="flex justify-between">
                      <div className="w-6 h-6 border-t-4 border-l-4 border-brand rounded-tl-md"></div>
                      <div className="w-6 h-6 border-t-4 border-r-4 border-brand rounded-tr-md"></div>
                    </div>
                    <div className="w-full border-t border-brand/40 animate-pulse" />
                    <div className="flex justify-between">
                      <div className="w-6 h-6 border-b-4 border-l-4 border-brand rounded-bl-md"></div>
                      <div className="w-6 h-6 border-b-4 border-r-4 border-brand rounded-br-md"></div>
                    </div>
                  </div>

                  {/* แถบสถานะ AI Preprocessing มุมบน */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none text-[11px]">
                    <span className="px-2.5 py-1 rounded-full bg-black/65 text-white font-medium backdrop-blur-xs">
                      Auto-Focus · ซูม {zoomLevel.toFixed(1)}x
                    </span>
                    {enhancePassCount > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-brand/85 text-white font-semibold backdrop-blur-xs">
                        ปรับคมชัดอัตโนมัติ (รอบที่ {enhancePassCount})
                      </span>
                    )}
                  </div>
                </div>

                {/* แถบควบคุมการซูม (Zoom Slider & Quick Presets) + ไฟฉาย + โฟกัส */}
                <div className="w-full max-w-[420px] rounded-2xl border border-line bg-canvas p-3.5 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-ink">
                      ระดับการซูมกล้อง (สำหรับ QR ขนาดเล็กหรืออยู่ไกล):
                    </span>
                    <div className="flex items-center gap-1">
                      {[1, 1.5, 2, 3].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleZoomChange(preset)}
                          className={`px-2 py-0.5 rounded-lg text-[11.5px] font-bold border transition ${
                            Math.abs(zoomLevel - preset) < 0.08
                              ? 'bg-brand text-white border-brand'
                              : 'bg-white text-ink border-line hover:border-brand'
                          }`}
                        >
                          {preset}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleZoomChange(zoomLevel - 0.2)}
                      className="w-8 h-8 rounded-lg border border-line bg-white text-ink font-bold hover:border-brand"
                      aria-label="ลดการซูม"
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.1}
                      value={zoomLevel}
                      onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                      className="flex-1 accent-brand cursor-pointer"
                      aria-label="แถบเลื่อนซูมกล้อง"
                    />
                    <button
                      type="button"
                      onClick={() => handleZoomChange(zoomLevel + 0.2)}
                      className="w-8 h-8 rounded-lg border border-line bg-white text-ink font-bold hover:border-brand"
                      aria-label="เพิ่มการซูม"
                    >
                      +
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-line/60">
                    <button
                      type="button"
                      onClick={handleManualRefocus}
                      className="px-3 py-1.5 rounded-xl border border-line bg-white hover:bg-soft text-[12px] font-semibold text-ink flex items-center gap-1.5"
                    >
                      <Icon name="search" className="w-3.5 h-3.5 text-brand" />
                      แตะเพื่อปรับโฟกัสใหม่
                    </button>

                    {availableCameras.length > 1 && (
                      <button
                        type="button"
                        onClick={handleSwitchCamera}
                        className="px-3 py-1.5 rounded-xl border border-line bg-white hover:bg-soft text-[12px] font-semibold text-ink flex items-center gap-1.5 cursor-pointer"
                        title="สลับกล้องหน้า/หลัง"
                      >
                        <Icon name="rotate-cw" className="w-3.5 h-3.5 text-brand" />
                        สลับกล้อง ({availableCameras.length})
                      </button>
                    )}

                    {capabilities.supportsTorch && (
                      <button
                        type="button"
                        onClick={handleToggleTorch}
                        className={`px-3 py-1.5 rounded-xl border text-[12px] font-semibold flex items-center gap-1.5 transition ${
                          torchOn
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-ink border-line hover:bg-soft'
                        }`}
                      >
                        <Icon name="eye" className="w-3.5 h-3.5" />
                        {torchOn ? 'ปิดไฟฉาย' : 'เปิดไฟฉาย (แสงน้อย)'}
                      </button>
                    )}
                  </div>
                </div>

                {/* ข้อความแนะนำอัจฉริยะแบบเรียลไทม์ */}
                <div
                  className={`w-full max-w-[420px] rounded-xl px-3.5 py-2.5 text-[12.5px] flex items-start gap-2 border ${
                    scanElapsedSec >= 4
                      ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                      : 'bg-brand-mint/30 border-brand/20 text-ink'
                  }`}
                >
                  <Icon
                    name="shield-check"
                    className="w-4 h-4 text-brand shrink-0 mt-0.5"
                  />
                  <span>{guidanceText}</span>
                </div>

                {lastScannedBanner && (
                  <div className="text-[12px] font-semibold text-brand">
                    {lastScannedBanner}
                  </div>
                )}
              </div>
            )}

            {/* โหมดอัปโหลดภาพ */}
            {mode === 'upload' && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-line rounded-2xl p-8 text-center bg-soft/50 hover:bg-soft cursor-pointer transition flex flex-col items-center gap-2"
              >
                <div className="w-12 h-12 rounded-2xl bg-brand-mint text-brand flex items-center justify-center">
                  <Icon name="upload" className="w-6 h-6" />
                </div>
                <b className="text-[14.5px] text-ink">เลือกรูปภาพที่มี QR Code จากเครื่อง</b>
                <span className="text-[12.5px] text-ink-mute">
                  รองรับไฟล์ JPG, PNG, WEBP หรือภาพถ่ายเอกสารที่ไม่คมชัด/เอียง (ระบบจะปรับความคมชัดและหมุนหาองศาอัตโนมัติ)
                </span>
              </div>
            )}

            {/* โหมดพิมพ์เลขที่เอกสารด้วยตนเอง */}
            {mode === 'manual' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleVerify(manualQuery, false);
                }}
                className="flex flex-col gap-3"
              >
                <label className="jw-lbl">เลขที่เอกสาร หรือ รหัสยืนยัน (Verification Token)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    placeholder="เช่น BK-2569-0120 หรือรหัสโทเค็น"
                    className="jw-in flex-1"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={verifying || !manualQuery.trim()}
                    className="jw-btn px-6 shrink-0"
                  >
                    {verifying ? 'กำลังตรวจ...' : 'ตรวจสอบ'}
                  </button>
                </div>
              </form>
            )}

          </div>
        )}

        {/* กล่องซ่อนสำหรับประมวลผลรูปภาพ */}
        <div id="qr-reader-hidden" className="hidden"></div>

        {/* กำลังตรวจสอบ */}
        {verifying && (
          <div className="jw-card p-10 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[14px] text-ink-mute">กำลังส่งรหัสไปตรวจสอบกับฐานข้อมูล อบต....</span>
          </div>
        )}

        {/* แสดงผลการตรวจสอบ (การ์ดรายละเอียดเอกสารแบบทางการ) */}
        {result && !verifying && (
          <div className="jw-card p-0 overflow-hidden flex flex-col shadow-xs border border-line">
            {/* ส่วนหัวแสดงสถานะผลการตรวจสอบ */}
            <div
              className={`p-4 sm:p-5 relative ${
                status === 'VALID'
                  ? 'bg-emerald-700 text-white'
                  : status === 'REVOKED'
                  ? 'bg-amber-600 text-white'
                  : 'bg-rose-700 text-white'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center text-white shrink-0 shadow-inner">
                    <Icon
                      name={status === 'VALID' ? 'check' : status === 'REVOKED' ? 'clock' : 'x'}
                      className="w-6 h-6 text-white"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30">
                        {status === 'VALID' ? 'เอกสารสมบูรณ์' : status === 'REVOKED' ? 'ยกเลิกแล้ว' : 'ไม่ถูกต้อง'}
                      </span>
                      <span className="text-[11px] text-white/80">อบต. ตรวจสอบแล้ว</span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-white mt-0.5 truncate">
                      {VERIFICATION_STATUS_LABEL[status]}
                    </h2>
                    {result.message && (
                      <p className="text-[12px] text-white/85 truncate mt-0.5">
                        {result.message}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetScan}
                  className="shrink-0 text-[11px] font-semibold bg-white/15 hover:bg-white/25 text-white px-2.5 py-1.5 rounded-lg border border-white/20 transition flex items-center gap-1"
                >
                  <Icon name="photo" className="w-3.5 h-3.5" />
                  สแกนใหม่
                </button>
              </div>
            </div>

            {/* เนื้อหาผลการตรวจสอบ */}
            <div className="p-4 sm:p-5 flex flex-col gap-4">
              {status !== 'NOT_FOUND' && (
                <>
                  {/* ข้อมูลเอกสารและผู้ยื่นคำขอ (จัดวางแบบ Grid อัตโนมัติ ไม่ล้นหน้าจอ) */}
                  <div className="bg-slate-50/80 rounded-xl border border-line p-3.5 space-y-2.5 text-xs sm:text-[13px]">
                    <div className="text-ink font-bold text-xs flex items-center gap-1.5 border-b border-line pb-2">
                      <Icon name="file-text" className="w-3.5 h-3.5 text-brand" />
                      <span>รายละเอียดเอกสารและคำขอ</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                      <div className="flex justify-between items-center py-1 border-b border-soft">
                        <span className="text-ink-mute">เลขที่เอกสาร:</span>
                        <b className="font-mono text-ink bg-white px-2 py-0.5 rounded border border-line text-xs">
                          {result.documentNumber}
                        </b>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-soft">
                        <span className="text-ink-mute">ประเภทเอกสาร:</span>
                        <span className="font-semibold text-ink">
                          {result.documentType ? VERIFICATION_DOC_TYPE_LABEL[result.documentType] : result.title}
                        </span>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-soft">
                        <span className="text-ink-mute">ผู้ยื่นคำขอ:</span>
                        <div className="text-right">
                          <b className="text-ink">{result.requesterName || '-'}</b>
                          {result.requesterName && (
                            <span className="text-[10px] text-brand bg-brand-mint/60 px-1 py-0.2 rounded font-medium ml-1">
                              Gov SSO
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-soft">
                        <span className="text-ink-mute">หน่วยงาน/ชุมชน:</span>
                        <span className="text-ink font-medium">{result.organization || '-'}</span>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-soft sm:col-span-2">
                        <span className="text-ink-mute shrink-0">วัตถุประสงค์:</span>
                        <span className="text-ink font-medium text-right truncate ml-2" title={result.purpose}>
                          {result.purpose || '-'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-soft">
                        <span className="text-ink-mute">ฉบับที่ (Version):</span>
                        <span className="font-semibold text-ink">ฉบับที่ {result.version || 1}</span>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-soft">
                        <span className="text-ink-mute">วันที่ออกเอกสาร:</span>
                        <span className="font-medium text-ink">{formatThaiDateTime(result.issuedAt, true)}</span>
                      </div>

                      {result.revokedAt && (
                        <div className="flex justify-between py-1 border-b border-soft text-status-amber sm:col-span-2">
                          <span>วันที่ยกเลิก:</span>
                          <b className="font-semibold">{formatThaiDateTime(result.revokedAt, true)}</b>
                        </div>
                      )}

                      <div className="flex justify-between items-center py-1 border-b border-soft">
                        <span className="text-ink-mute">ผู้ออกเอกสาร:</span>
                        <span className="font-medium text-ink">{result.issuingOrg || 'องค์การบริหารส่วนตำบล (อบต.)'}</span>
                      </div>

                      <div className="flex justify-between items-center py-1 border-b border-soft">
                        <span className="text-ink-mute">สถานะคำขอ:</span>
                        {(() => {
                          const statusKey = result.requestStatus as RequestStatus | undefined;
                          const meta = statusKey ? STATUS_META[statusKey] : undefined;
                          return (
                            <Chip tone={meta?.tone || 'green'}>
                              {meta?.label || result.requestStatus || 'อนุมัติแล้ว'}
                            </Chip>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* ลายมือชื่อและการอนุมัติดิจิทัล (3 ระดับ - แสดงผลยืดหยุ่น ปลอดภัยไม่ล้นจอ) */}
                  {result.signatures && result.signatures.length > 0 && (
                    <div className="rounded-xl border border-line p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between border-b border-line pb-2">
                        <b className="text-xs text-ink flex items-center gap-1.5">
                          <Icon name="file-text" className="w-3.5 h-3.5 text-brand" />
                          ลายมือชื่อและการอนุมัติดิจิทัล ({result.signatures.length} ระดับ)
                        </b>
                        <span className="text-[10px] font-bold text-status-act bg-[#F2FBF6] px-2 py-0.5 rounded border border-[#A3E5C1]">
                          ✓ อนุมัติผ่านระบบครบถ้วน
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        {result.signatures.map((sig, idx) => {
                          const isLast = idx === (result.signatures?.length ?? 1) - 1;
                          return (
                            <div
                              key={idx}
                              className={`p-2.5 rounded-lg border flex sm:flex-col justify-between gap-1 transition ${
                                isLast
                                  ? 'bg-emerald-50/70 border-emerald-200'
                                  : 'bg-slate-50 border-line'
                              }`}
                            >
                              <div>
                                <span className="text-[10px] font-bold text-ink-mute block uppercase">
                                  {idx + 1}. {sig.title}
                                </span>
                                <b className="text-ink block text-xs">{sig.signerName}</b>
                                <span className="text-[10px] text-ink-mute block">
                                  {formatThaiDateTime(sig.signedAt, true)}
                                </span>
                              </div>
                              <div className="text-right sm:text-left sm:pt-1 sm:border-t sm:border-line">
                                <span className={`text-[10px] font-semibold ${isLast ? 'text-emerald-800 font-bold' : 'text-status-act'}`}>
                                  ✓ {isLast ? 'อนุมัติเสร็จสิ้น' : 'อนุมัติแล้ว'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* กล่องแสดงรหัสแฮชเข้ารหัส SHA-256 พร้อมปุ่มคัดลอก */}
                  {result.documentHash && (
                    <div className="rounded-xl bg-slate-50 border border-line p-2.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-ink-mute">รหัสลายพิมพ์ดิจิทัล (SHA-256 Hash):</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(result.documentHash || '');
                            setCopiedHash(true);
                            setTimeout(() => setCopiedHash(false), 2000);
                          }}
                          className="text-brand hover:underline font-semibold"
                        >
                          {copiedHash ? '✓ คัดลอกแล้ว' : 'คัดลอก'}
                        </button>
                      </div>
                      <div className="bg-white px-2.5 py-1.5 rounded border border-line font-mono text-[10.5px] text-ink break-all select-all">
                        {result.documentHash}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ปุ่มนำทาง */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-t border-line">
                <div className="flex gap-2">
                  {result.documentId && (
                    <Link
                      href={`/approver/permit/${result.documentId}`}
                      className="jw-btn flex-1 sm:flex-none px-4 py-2.5 text-[13px] text-center flex items-center justify-center gap-1.5"
                    >
                      <Icon name="file-text" className="w-4 h-4" />
                      เปิดดูเอกสารฉบับเต็ม (PDF)
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleResetScan}
                    className="jw-btn-sec flex-1 sm:flex-none px-4 py-2.5 text-[13px]"
                  >
                    สแกนเอกสารอื่น
                  </button>
                </div>

                <Link href="/staff" className="text-center text-[12.5px] text-ink-mute hover:text-ink underline py-1">
                  ← กลับหน้าหลักเจ้าหน้าที่
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ประวัติการตรวจสอบล่าสุดของเจ้าหน้าที่ */}
        <div className="jw-card p-5 flex flex-col gap-3.5">
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <b className="text-[15px] text-ink flex items-center gap-2">
              <Icon name="clock" className="w-4 h-4 text-brand" />
              ประวัติการสแกนตรวจสอบเอกสารล่าสุด
            </b>
            <button
              type="button"
              onClick={loadHistory}
              disabled={historyLoading}
              className="text-[12.5px] text-brand hover:underline font-semibold"
            >
              {historyLoading ? 'กำลังโหลด...' : 'รีเฟรช'}
            </button>
          </div>

          {history.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-ink-mute">
              ยังไม่มีประวัติการสแกนเอกสาร
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl border border-line flex items-center justify-between gap-3 hover:bg-soft/40 transition text-[13px]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        item.result === 'VALID'
                          ? 'bg-[#E5F7ED] text-status-act'
                          : item.result === 'REVOKED'
                          ? 'bg-[#FFF4E5] text-status-amber'
                          : 'bg-[#FEECEC] text-status-crit'
                      }`}
                    >
                      <Icon
                        name={item.result === 'VALID' ? 'check' : item.result === 'REVOKED' ? 'clock' : 'x'}
                        className="w-4 h-4"
                      />
                    </div>
                    <div className="flex flex-col">
                      <b className="text-ink font-mono">{item.documentNumber || item.verificationId}</b>
                      <span className="text-[11.5px] text-ink-mute">
                        {item.scannedByName ? `ผู้ตรวจ: ${item.scannedByName}` : 'สแกนผ่านระบบ'} · {formatThaiDateTime(item.scannedAt, false)}
                      </span>
                    </div>
                  </div>

                  <Chip
                    tone={
                      item.result === 'VALID'
                        ? 'green'
                        : item.result === 'REVOKED'
                        ? 'amber'
                        : 'red'
                    }
                  >
                    {item.result === 'VALID'
                      ? 'ผ่าน'
                      : item.result === 'REVOKED'
                      ? 'ยกเลิกแล้ว'
                      : 'ไม่ถูกต้อง'}
                  </Chip>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
