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

  // Advanced scanner controls state
  const [continuousMode, setContinuousMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [usingDigitalZoom, setUsingDigitalZoom] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [capabilities, setCapabilities] = useState<CameraHardwareCapabilities>(
    DEFAULT_CAMERA_CAPABILITIES,
  );
  const [scanElapsedSec, setScanElapsedSec] = useState(0);
  const [enhancePassCount, setEnhancePassCount] = useState(0);
  const [lastScannedBanner, setLastScannedBanner] = useState('');

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
        await qrScannerRef.current.stop();
        qrScannerRef.current.clear();
      } catch {
        // ignore
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

  const startCamera = useCallback(async () => {
    setCameraError('');
    setScanning(true);
    setScanElapsedSec(0);
    setEnhancePassCount(0);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');

      // เคลียร์ scanner เดิมหากมี
      await stopCamera();

      const scanner = new Html5Qrcode('qr-reader', {
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      });
      qrScannerRef.current = scanner;
      setScanning(true);

      const videoConstraints = getOptimalVideoConstraints();

      try {
        await scanner.start(
          videoConstraints,
          {
            fps: 15,
            qrbox: computeResponsiveQrBox,
            aspectRatio: 1.0,
            disableFlip: false,
          },
          (decodedText) => {
            handleVerify(decodedText, true);
          },
          () => {
            // ไม่ต้องแสดง error ทุกเฟรมที่ยังไม่พบ QR
          },
        );
      } catch {
        // Fallback กรณีอุปกรณ์บางรุ่นไม่รองรับ advanced constraints
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: computeResponsiveQrBox,
            aspectRatio: 1.0,
          },
          (decodedText) => {
            handleVerify(decodedText, true);
          },
          () => {},
        );
      }

      // ตรวจสอบความสามารถของกล้อง (Hardware Zoom, Torch, Continuous Focus)
      setTimeout(() => {
        const track = getActiveVideoTrack('qr-reader');
        const caps = inspectTrackCapabilities(track);
        setCapabilities(caps);
        triggerCameraRefocus(track);
      }, 450);
    } catch (err: any) {
      setCameraError(
        err?.message?.includes('NotAllowedError') || err?.name === 'NotAllowedError'
          ? 'กรุณาอนุญาตให้เบราว์เซอร์เข้าถึงกล้อง เพื่อสแกน QR Code'
          : 'ไม่สามารถเปิดกล้องได้ หรืออุปกรณ์ไม่รองรับการเปิดกล้อง กรุณาใช้วิธีอัปโหลดภาพหรือกรอกเลขที่เอกสาร',
      );
      setScanning(false);
    }
  }, [handleVerify, stopCamera]);

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

  // Background Multi-Pass Image Preprocessing Loop สำหรับภาพเบลอ / อยู่ไกล / แสงน้อย / เอียง
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
        const track = getActiveVideoTrack('qr-reader');
        triggerCameraRefocus(track);
      }

      const decoded = await tryEnhancedVideoFrameDecode('qr-reader', currentPass);
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
    const track = getActiveVideoTrack('qr-reader');
    const appliedHardware = await applyCameraZoom(track, clamped, capabilities);
    setUsingDigitalZoom(!appliedHardware && clamped > 1);
  };

  // เปิด/ปิดไฟฉาย (Torch)
  const handleToggleTorch = async () => {
    const track = getActiveVideoTrack('qr-reader');
    const nextState = !torchOn;
    const ok = await applyCameraTorch(track, nextState);
    if (ok) {
      setTorchOn(nextState);
    }
  };

  // แตะเพื่อโฟกัสใหม่
  const handleManualRefocus = async () => {
    const track = getActiveVideoTrack('qr-reader');
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
      maxWidth="max-w-[840px]"
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
                    className="w-full h-full transition-transform duration-200 ease-out"
                    style={
                      usingDigitalZoom && zoomLevel > 1
                        ? {
                            transform: `scale(${zoomLevel})`,
                            transformOrigin: 'center center',
                          }
                        : undefined
                    }
                  ></div>

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

            {cameraError && (
              <div className="p-3.5 rounded-xl bg-[#FFF2F2] border border-[#F9C2C2] text-status-crit text-[13px] flex items-start gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{cameraError}</span>
              </div>
            )}
          </div>
        )}

        {/* กล่องซ่อนสำหรับ Html5Qrcode decode image */}
        <div id="qr-reader-hidden" className="hidden"></div>

        {/* กำลังตรวจสอบ */}
        {verifying && (
          <div className="jw-card p-10 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[14px] text-ink-mute">กำลังส่งรหัสไปตรวจสอบกับฐานข้อมูล อบต....</span>
          </div>
        )}

        {/* แสดงผลการตรวจสอบ (Result Screen) */}
        {result && !verifying && (
          <div className="jw-card p-5 sm:p-7 flex flex-col gap-6">
            {/* Header แสดงสถานะ */}
            <div
              className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${
                status === 'VALID'
                  ? 'bg-[#F2FBF6] border-[#A3E5C1]'
                  : status === 'REVOKED'
                  ? 'bg-[#FFF9EC] border-[#FDE3A7]'
                  : 'bg-[#FFF2F2] border-[#F9C2C2]'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    status === 'VALID'
                      ? 'bg-status-act text-white'
                      : status === 'REVOKED'
                      ? 'bg-status-amber text-white'
                      : 'bg-status-crit text-white'
                  }`}
                >
                  <Icon
                    name={status === 'VALID' ? 'check' : status === 'REVOKED' ? 'clock' : 'x'}
                    className="w-6 h-6"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <b className="text-[18px] text-ink">{VERIFICATION_STATUS_LABEL[status]}</b>
                    <Chip tone={tone}>
                      {status === 'VALID'
                        ? 'เอกสารสมบูรณ์'
                        : status === 'REVOKED'
                        ? 'ยกเลิกแล้ว'
                        : 'ไม่ถูกต้อง'}
                    </Chip>
                  </div>
                  <span className="text-[13px] text-ink-mute">
                    {result.message}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetScan}
                  className="jw-btn-sec py-2 px-4 text-[13px] flex items-center gap-1.5"
                >
                  <Icon name="photo" className="w-4 h-4" />
                  สแกนใหม่
                </button>
              </div>
            </div>

            {/* ข้อมูลเอกสารและผู้ยื่นคำขอ (เฉพาะเจ้าหน้าที่) */}
            {status !== 'NOT_FOUND' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13.5px]">
                <div className="border border-line rounded-2xl p-4.5 flex flex-col gap-3 bg-white">
                  <b className="text-[14.5px] text-ink border-b border-line pb-2 flex items-center gap-2">
                    <Icon name="file-text" className="w-4 h-4 text-brand" />
                    ข้อมูลเอกสาร
                  </b>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between py-1 border-b border-soft">
                      <span className="text-ink-mute">เลขที่เอกสาร:</span>
                      <b className="font-mono text-ink">{result.documentNumber}</b>
                    </div>
                    <div className="flex justify-between py-1 border-b border-soft">
                      <span className="text-ink-mute">ประเภทเอกสาร:</span>
                      <span className="font-semibold text-ink">
                        {result.documentType ? VERIFICATION_DOC_TYPE_LABEL[result.documentType] : result.title}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-soft">
                      <span className="text-ink-mute">ฉบับที่ (Version):</span>
                      <span className="font-semibold text-ink">ฉบับที่ {result.version || 1}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-soft">
                      <span className="text-ink-mute">วันที่ออกเอกสาร:</span>
                      <span className="font-semibold text-ink">{formatThaiDateTime(result.issuedAt, true)}</span>
                    </div>
                    {result.revokedAt && (
                      <div className="flex justify-between py-1 border-b border-soft text-status-amber">
                        <span>วันที่ยกเลิก:</span>
                        <b className="font-semibold">{formatThaiDateTime(result.revokedAt, true)}</b>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-b border-soft">
                      <span className="text-ink-mute">ผู้ออกเอกสาร:</span>
                      <span className="font-semibold text-ink">{result.issuingOrg || 'องค์การบริหารส่วนตำบล (อบต.)'}</span>
                    </div>
                  </div>
                </div>

                <div className="border border-line rounded-2xl p-4.5 flex flex-col gap-3 bg-white">
                  <b className="text-[14.5px] text-ink border-b border-line pb-2 flex items-center gap-2">
                    <Icon name="user" className="w-4 h-4 text-brand" />
                    ข้อมูลผู้ยื่นคำขอ & การอนุมัติ
                  </b>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between py-1 border-b border-soft">
                      <span className="text-ink-mute">ชื่อผู้ยื่นคำขอ:</span>
                      <b className="text-ink">{result.requesterName || '-'}</b>
                    </div>
                    <div className="flex justify-between py-1 border-b border-soft">
                      <span className="text-ink-mute">หน่วยงาน/ชุมชน:</span>
                      <span className="text-ink">{result.organization || '-'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-soft">
                      <span className="text-ink-mute">วัตถุประสงค์:</span>
                      <span className="text-ink line-clamp-1">{result.purpose || '-'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-soft">
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

                {/* ลายมือชื่อผู้พิจารณาและอนุมัติ */}
                {result.signatures && result.signatures.length > 0 && (
                  <div className="md:col-span-2 border border-line rounded-2xl p-4.5 bg-white flex flex-col gap-2.5">
                    <b className="text-[14.5px] text-ink border-b border-line pb-2 flex items-center gap-2">
                      <Icon name="file-text" className="w-4 h-4 text-brand" />
                      ลายมือชื่อและการอนุมัติดิจิทัล (3 ระดับ)
                    </b>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      {result.signatures.map((sig, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-soft/70 border border-line flex flex-col gap-1 text-[12.5px]">
                          <span className="font-bold text-brand">{sig.title}</span>
                          <span className="font-semibold text-ink">{sig.signerName}</span>
                          <span className="text-[11.5px] text-ink-mute">{formatThaiDateTime(sig.signedAt, true)}</span>
                          <span className="text-[11px] text-status-act font-semibold">✓ อนุมัติผ่านระบบ</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Document Hash */}
                {result.documentHash && (
                  <div className="md:col-span-2 p-3 rounded-xl bg-soft text-[12px] flex flex-col gap-1">
                    <span className="text-ink-mute font-medium">รหัสลายพิมพ์เอกสารดิจิทัล (SHA-256 Hash):</span>
                    <code className="font-mono text-[11px] bg-white p-2 rounded-lg border border-line break-all text-ink">
                      {result.documentHash}
                    </code>
                  </div>
                )}
              </div>
            )}

            {/* ปุ่มนำทาง */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line">
              <div className="flex gap-2 w-full sm:w-auto">
                {result.documentId && (
                  <Link
                    href={`/approver/permit/${result.documentId}`}
                    className="jw-btn-sec flex-1 sm:flex-none px-5 py-2.5 text-[13px] text-center"
                  >
                    เปิดดูเอกสารฉบับเต็ม (PDF)
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleResetScan}
                  className="jw-btn flex-1 sm:flex-none px-6 py-2.5 text-[13px]"
                >
                  สแกนเอกสารอื่น
                </button>
              </div>

              <Link href="/staff" className="text-[13px] text-ink-mute hover:text-ink underline">
                กลับหน้าหลักเจ้าหน้าที่
              </Link>
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
