import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import QRCode from 'qrcode';
import {
  Account,
  DocumentScanLog,
  DocumentVerification,
  PublicVerificationResult,
  StaffVerificationResult,
  VERIFICATION_DOC_TYPE_LABEL,
  VerificationDocumentType,
  VerificationStatus,
} from '@jongwen/shared';
import { DbService } from '../db/db.service';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(private readonly db: DbService) {}

  /**
   * คำนวณ SHA-256 Document Hash สำหรับตรวจสอบความสมบูรณ์ของเอกสาร
   */
  computeHash(data: {
    documentId: string;
    documentNumber: string;
    documentType: string;
    requestStatus: string;
    signatures: { signerName?: string; signedAt?: string; decision?: string }[];
    version: number;
    issuedAt: string;
  }): string {
    const raw = JSON.stringify({
      id: data.documentId,
      no: data.documentNumber,
      type: data.documentType,
      st: data.requestStatus,
      sigs: data.signatures.map((s) => `${s.signerName || ''}:${s.decision || ''}:${s.signedAt || ''}`).sort(),
      v: data.version,
      at: data.issuedAt,
    });
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * สร้างภาพ QR Code เป็น Base64 Data URL (PNG)
   */
  async generateQrCodeDataUrl(text: string): Promise<string> {
    return QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 260,
      color: {
        dark: '#0B2545', // สีกรมท่าทางการของ อบต.น้ำชำ
        light: '#FFFFFF',
      },
    });
  }

  /**
   * สร้าง Verification URL สำหรับใส่ใน QR Code
   */
  getVerificationUrl(token: string): string {
    const origin =
      process.env.APP_ORIGIN ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';
    return `${origin}/verify/${token}`;
  }

  /**
   * สร้างหรือดึงข้อมูลยืนยันเอกสารและ QR Code
   */
  async createOrGetVerification(
    documentId: string,
    options?: {
      documentType?: VerificationDocumentType;
      title?: string;
      forceNew?: boolean;
    },
  ): Promise<DocumentVerification> {
    const req = this.db.requests.find((r) => r.id === documentId || r.code === documentId);
    if (!req) {
      throw new NotFoundException(`ไม่พบเอกสารรหัส ${documentId}`);
    }

    // กำหนดประเภทเอกสารอัตโนมัติหากไม่ระบุ
    let docType: VerificationDocumentType = options?.documentType || 'booking_permit';
    if (!options?.documentType) {
      if (req.type === 'booking') {
        docType = req.status === 'approved' ? 'booking_permit' : 'booking_request';
      } else if (req.type === 'borrow') {
        docType =
          req.status === 'approved' || req.status === 'borrowing' || req.status === 'returned'
            ? 'borrow_permit'
            : 'borrow_request';
      } else {
        docType = 'booking_request';
      }
    }

    const defaultTitle = `${VERIFICATION_DOC_TYPE_LABEL[docType]} (${req.code})`;
    const title = options?.title || defaultTitle;
    const documentNumber = req.code;

    // ค้นหา Verification ปัจจุบันที่ยัง VALID
    const activeVer = this.db.verifications.find(
      (v) => v.documentId === req.id && v.status === 'VALID' && v.documentType === docType,
    );

    // ตรวจสอบลายมือชื่อที่มีอยู่
    const reqSignatures = 'signatures' in req && Array.isArray(req.signatures) ? req.signatures : [];
    const signatures = reqSignatures.map((s) => ({
      signerName: s.signerName,
      signedAt: s.at,
      decision: s.decision,
    }));

    if (activeVer && !options?.forceNew) {
      // ตรวจสอบว่าคำขอถูกยกเลิกหรือไม่
      if (req.status === 'cancelled') {
        activeVer.status = 'REVOKED';
        activeVer.revokedAt = req.updatedAt || new Date().toISOString();
        activeVer.updatedAt = new Date().toISOString();
        await this.db.persistVerification(activeVer);
      } else {
        // คืนค่ารายการเดิมพร้อม QR Code Data URL
        const verifyUrl = this.getVerificationUrl(activeVer.verificationToken);
        const qrCodeDataUrl = await this.generateQrCodeDataUrl(verifyUrl);
        return {
          ...activeVer,
          verificationUrl: verifyUrl,
          qrCodeDataUrl,
        };
      }
    }

    // หากมีการสร้างฉบับใหม่ ให้ยกเลิกฉบับเดิมทั้งหมด
    const previousVersions = this.db.verifications.filter(
      (v) => v.documentId === req.id && v.documentType === docType,
    );
    const nextVersion = previousVersions.length + 1;
    const now = new Date().toISOString();

    for (const prev of previousVersions) {
      if (prev.status === 'VALID') {
        prev.status = 'REVOKED';
        prev.revokedAt = now;
        prev.updatedAt = now;
        await this.db.persistVerification(prev);
      }
    }

    const verificationToken = randomBytes(16).toString('hex');
    const documentHash = this.computeHash({
      documentId: req.id,
      documentNumber,
      documentType: docType,
      requestStatus: req.status,
      signatures,
      version: nextVersion,
      issuedAt: now,
    });

    const newVer: DocumentVerification = {
      id: `ver-${randomBytes(8).toString('hex')}`,
      documentId: req.id,
      verificationToken,
      documentNumber,
      documentHash,
      version: nextVersion,
      status: req.status === 'cancelled' ? 'REVOKED' : 'VALID',
      documentType: docType,
      title,
      issuingOrg: 'องค์การบริหารส่วนตำบลน้ำชำ',
      metadata: {
        requestId: req.id,
        requestCode: req.code,
        requesterId: req.requesterId,
        requesterName: req.requesterName,
        organization: req.organization,
        requestStatus: req.status,
      },
      issuedAt: now,
      revokedAt: req.status === 'cancelled' ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.persistVerification(newVer);

    const verifyUrl = this.getVerificationUrl(verificationToken);
    const qrCodeDataUrl = await this.generateQrCodeDataUrl(verifyUrl);

    return {
      ...newVer,
      verificationUrl: verifyUrl,
      qrCodeDataUrl,
    };
  }

  /**
   * ดึงข้อมูลการยืนยันเอกสารของคำขอ
   */
  async getVerificationByDocumentId(documentId: string): Promise<DocumentVerification | null> {
    const req = this.db.requests.find((r) => r.id === documentId || r.code === documentId);
    const targetId = req?.id || documentId;

    const latest = this.db.verifications.find((v) => v.documentId === targetId && v.status === 'VALID')
      || this.db.verifications.find((v) => v.documentId === targetId);

    if (!latest) return null;

    const verifyUrl = this.getVerificationUrl(latest.verificationToken);
    const qrCodeDataUrl = await this.generateQrCodeDataUrl(verifyUrl);

    return {
      ...latest,
      verificationUrl: verifyUrl,
      qrCodeDataUrl,
    };
  }

  /**
   * ตรวจสอบเอกสารผ่าน Public Token (สำหรับประชาชนทั่วไป ไม่ต้องเข้าสู่ระบบและไม่เปิดเผยข้อมูลส่วนบุคคล)
   */
  async verifyPublic(token: string, ip?: string, userAgent?: string): Promise<PublicVerificationResult> {
    const cleanToken = token.trim();
    const ver = this.db.verifications.find((v) => v.verificationToken === cleanToken);

    if (!ver) {
      // บันทึกประวัติกรณีไม่พบข้อมูล
      const scanLog: DocumentScanLog = {
        id: `scan-${randomBytes(8).toString('hex')}`,
        verificationId: `unknown:${cleanToken.slice(0, 32)}`,
        result: 'NOT_FOUND',
        note: `ตรวจสอบไม่พบ Token: ${cleanToken.slice(0, 8)}...`,
        ip,
        userAgent,
        scannedAt: new Date().toISOString(),
      };
      await this.db.persistScanLog(scanLog);

      return {
        status: 'NOT_FOUND',
        message: 'ไม่พบข้อมูลเอกสารในระบบ หรือรหัสยืนยันไม่ถูกต้อง',
      };
    }

    const req = this.db.requests.find((r) => r.id === ver.documentId);

    // หากคำขอต้นทางถูกยกเลิกแล้ว
    if (req?.status === 'cancelled' && ver.status === 'VALID') {
      ver.status = 'REVOKED';
      ver.revokedAt = req.updatedAt || new Date().toISOString();
      ver.updatedAt = new Date().toISOString();
      await this.db.persistVerification(ver);
    }

    const currentStatus: VerificationStatus = ver.status;

    // บันทึกประวัติการสแกน
    const scanLog: DocumentScanLog = {
      id: `scan-${randomBytes(8).toString('hex')}`,
      verificationId: ver.id,
      result: currentStatus,
      documentNumber: ver.documentNumber,
      documentTitle: ver.title,
      ip,
      userAgent,
      scannedAt: new Date().toISOString(),
    };
    await this.db.persistScanLog(scanLog);

    if (currentStatus === 'REVOKED') {
      return {
        status: 'REVOKED',
        documentNumber: ver.documentNumber,
        documentType: ver.documentType,
        title: ver.title,
        issuingOrg: ver.issuingOrg,
        issuedAt: ver.issuedAt,
        revokedAt: ver.revokedAt,
        version: ver.version,
        documentHash: ver.documentHash,
        requestStatus: req?.status,
        message: 'เอกสารฉบับนี้ถูกยกเลิกแล้ว ไม่สามารถใช้อ้างอิงทางราชการได้',
      };
    }

    return {
      status: 'VALID',
      documentNumber: ver.documentNumber,
      documentType: ver.documentType,
      title: ver.title,
      issuingOrg: ver.issuingOrg,
      issuedAt: ver.issuedAt,
      version: ver.version,
      documentHash: ver.documentHash,
      requestStatus: req?.status,
      message: 'เอกสารถูกต้องและยังมีผลสมบูรณ์ตามฐานข้อมูลขององค์การบริหารส่วนตำบลน้ำชำ',
    };
  }

  /**
   * ตรวจสอบเอกสารสำหรับเจ้าหน้าที่ (แสดงรายละเอียดผู้ขอ ลายเซ็น และประวัติครบถ้วน)
   */
  async verifyStaff(
    query: string,
    staffUser?: Account,
    ip?: string,
    userAgent?: string,
  ): Promise<StaffVerificationResult> {
    if (!query || !query.trim()) {
      throw new BadRequestException('กรุณาระบุรหัส QR Code หรือเลขที่เอกสาร');
    }

    let searchKey = query.trim();

    // หากสแกนได้เป็น URL ให้แกะ token ออกมา
    const urlMatch = /\/verify\/([a-zA-Z0-9_-]+)/.exec(searchKey);
    if (urlMatch) {
      searchKey = urlMatch[1];
    }

    // ค้นหาตาม verificationToken ก่อน แล้วตามด้วย documentNumber หรือ documentId
    let ver = this.db.verifications.find(
      (v) => v.verificationToken.toLowerCase() === searchKey.toLowerCase(),
    );

    if (!ver) {
      ver = this.db.verifications.find(
        (v) =>
          v.documentNumber.toLowerCase() === searchKey.toLowerCase() ||
          v.documentId.toLowerCase() === searchKey.toLowerCase(),
      );
    }

    if (!ver) {
      const scanLog: DocumentScanLog = {
        id: `scan-${randomBytes(8).toString('hex')}`,
        verificationId: `unknown:${searchKey.slice(0, 32)}`,
        scannedBy: staffUser?.id,
        scannedByName: staffUser?.name,
        scannedByRole: staffUser?.role,
        result: 'NOT_FOUND',
        note: `เจ้าหน้าที่สแกนไม่พบเอกสาร: ${searchKey}`,
        ip,
        userAgent,
        scannedAt: new Date().toISOString(),
      };
      await this.db.persistScanLog(scanLog);

      return {
        status: 'NOT_FOUND',
        message: `ไม่พบข้อมูลเอกสารในระบบสำหรับ "${searchKey}"`,
      };
    }

    const req = this.db.requests.find((r) => r.id === ver.documentId);

    // หากคำขอต้นทางถูกยกเลิกแล้ว
    if (req?.status === 'cancelled' && ver.status === 'VALID') {
      ver.status = 'REVOKED';
      ver.revokedAt = req.updatedAt || new Date().toISOString();
      ver.updatedAt = new Date().toISOString();
      await this.db.persistVerification(ver);
    }

    const currentStatus: VerificationStatus = ver.status;

    // บันทึกประวัติการตรวจสอบโดยเจ้าหน้าที่
    const scanLog: DocumentScanLog = {
      id: `scan-${randomBytes(8).toString('hex')}`,
      verificationId: ver.id,
      scannedBy: staffUser?.id,
      scannedByName: staffUser?.name,
      scannedByRole: staffUser?.role,
      result: currentStatus,
      documentNumber: ver.documentNumber,
      documentTitle: ver.title,
      ip,
      userAgent,
      scannedAt: new Date().toISOString(),
    };
    await this.db.persistScanLog(scanLog);

    // ดึงประวัติการสแกนของเอกสารฉบับนี้
    const history = this.db.scanLogs.filter((l) => l.verificationId === ver.id);

    return {
      status: currentStatus,
      documentId: ver.documentId,
      documentNumber: ver.documentNumber,
      documentType: ver.documentType,
      title: ver.title,
      issuingOrg: ver.issuingOrg,
      issuedAt: ver.issuedAt,
      revokedAt: ver.revokedAt,
      version: ver.version,
      documentHash: ver.documentHash,
      requestStatus: req?.status,
      requesterName: req?.requesterName,
      organization: req?.organization,
      purpose: req && 'purpose' in req ? req.purpose : req?.type === 'repair' ? req.detail : undefined,
      signatures: req && 'signatures' in req && Array.isArray(req.signatures)
        ? req.signatures.map((s) => ({
            level: s.level,
            title: s.title,
            signerName: s.signerName,
            decision: s.decision,
            signedAt: s.at,
          }))
        : undefined,
      history,
      message:
        currentStatus === 'VALID'
          ? 'เอกสารถูกต้องและยังมีผลสมบูรณ์'
          : currentStatus === 'REVOKED'
          ? 'เอกสารถูกยกเลิกแล้ว'
          : 'ข้อมูลเอกสารไม่ถูกต้อง',
    };
  }

  /**
   * ยกเลิกการยืนยันเอกสาร
   */
  async revokeVerification(
    documentId: string,
    reason?: string,
    actor?: Account,
  ): Promise<DocumentVerification> {
    const ver = this.db.verifications.find(
      (v) => (v.documentId === documentId || v.documentNumber === documentId) && v.status === 'VALID',
    );

    if (!ver) {
      throw new NotFoundException(`ไม่พบเอกสารยืนยันที่ยังมีผลสำหรับรหัส ${documentId}`);
    }

    const now = new Date().toISOString();
    ver.status = 'REVOKED';
    ver.revokedAt = now;
    ver.updatedAt = now;
    if (reason) {
      ver.metadata = {
        ...ver.metadata,
        revokeReason: reason,
        revokedBy: actor?.name,
        revokedByRole: actor?.role,
      };
    }

    await this.db.persistVerification(ver);

    if (actor) {
      await this.db.log(
        'request',
        `ยกเลิกการยืนยันเอกสาร ${ver.documentNumber}`,
        `ผู้ยกเลิก: ${actor.name} (${actor.position || actor.role}) · เหตุผล: ${reason || 'ตามคำสั่ง'}`,
        { id: actor.id, name: actor.name, role: actor.role },
      );
    }

    return ver;
  }

  /**
   * ดึงประวัติการตรวจสอบเอกสารล่าสุดสำหรับเจ้าหน้าที่
   */
  getVerifyHistory(limit = 50): (DocumentScanLog & { documentTitle?: string; documentNumber?: string })[] {
    const logs = this.db.scanLogs.slice(0, limit);
    return logs.map((log) => {
      const ver = this.db.verifications.find((v) => v.id === log.verificationId);
      return {
        ...log,
        documentNumber: log.documentNumber || ver?.documentNumber,
        documentTitle: log.documentTitle || ver?.title,
      };
    });
  }
}
