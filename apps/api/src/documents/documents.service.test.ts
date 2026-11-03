import { describe, expect, it, beforeEach } from 'vitest';
import { DocumentsService } from './documents.service';
import { DbService } from '../db/db.service';
import { BookingRequest } from '@japjong/shared';

describe('DocumentsService & QR Code Verification', () => {
  let db: DbService;
  let service: DocumentsService;

  const mockApprovedBooking: BookingRequest = {
    id: 'r-test-bk-1',
    code: 'BK-2569-9999',
    type: 'booking',
    status: 'approved',
    requesterId: 'u-somchai',
    requesterName: 'สมชาย ใจดี',
    organization: 'ชุมชนบ้านน้ำชำ หมู่ 3',
    purpose: 'ประชุมจัดงานประจำปี',
    activity: 'ประชุมชุมชน',
    venueIds: ['v-main-hall'],
    periods: [{ start: '2026-11-10T09:00:00+07:00', end: '2026-11-10T16:00:00+07:00' }],
    attendees: 50,
    attachments: [],
    extraItems: [],
    createdAt: '2026-11-01T09:00:00+07:00',
    updatedAt: '2026-11-02T10:00:00+07:00',
    signatures: [
      { level: 'staff', signerId: 's-suda', signerName: 'สุดา มีสุข', title: 'เจ้าหน้าที่', at: '2026-11-01T10:00:00+07:00', decision: 'approve' },
      { level: 'l2', signerId: 'a-wichai', signerName: 'วิชัย รักถิ่น', title: 'ปลัด อบต.', at: '2026-11-01T14:00:00+07:00', decision: 'approve' },
      { level: 'l1', signerId: 'a-prasert', signerName: 'ประเสริฐ ศรีสุข', title: 'นายก อบต.', at: '2026-11-02T10:00:00+07:00', decision: 'approve' },
    ],
  };

  beforeEach(() => {
    db = new DbService();
    // In-memory setup
    db.requests = [JSON.parse(JSON.stringify(mockApprovedBooking))];
    db.verifications = [];
    db.scanLogs = [];
    service = new DocumentsService(db);
  });

  it('1. คำนวณ SHA-256 Document Hash และสร้าง QR Code Data URL สำเร็จ', async () => {
    const hash = service.computeHash({
      documentId: 'r-test-bk-1',
      documentNumber: 'BK-2569-9999',
      documentType: 'booking_permit',
      requestStatus: 'approved',
      signatures: [{ signerName: 'ประเสริฐ ศรีสุข', signedAt: '2026-11-02T10:00:00+07:00', decision: 'approve' }],
      version: 1,
      issuedAt: '2026-11-02T10:00:00+07:00',
    });

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    const qrDataUrl = await service.generateQrCodeDataUrl('https://japjong.local/verify/test-token');
    expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('2. สร้างข้อมูลยืนยันเอกสาร (Verification) และฝัง QR Code ได้ถูกต้อง', async () => {
    const ver = await service.createOrGetVerification('r-test-bk-1');

    expect(ver).toBeDefined();
    expect(ver.documentNumber).toBe('BK-2569-9999');
    expect(ver.status).toBe('VALID');
    expect(ver.version).toBe(1);
    expect(ver.verificationToken).toBeDefined();
    expect(ver.verificationToken.length).toBeGreaterThan(16);
    expect(ver.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(ver.verificationUrl).toContain(`/verify/${ver.verificationToken}`);
  });

  it('3. ตรวจสอบผ่าน Public API (GET /public/verify/:token) ส่งคืนสถานะ VALID โดยไม่เปิดเผยข้อมูลส่วนบุคคล', async () => {
    const ver = await service.createOrGetVerification('r-test-bk-1');
    const pubRes = await service.verifyPublic(ver.verificationToken, '127.0.0.1');

    expect(pubRes.status).toBe('VALID');
    expect(pubRes.documentNumber).toBe('BK-2569-9999');
    expect(pubRes.issuingOrg).toBe('องค์การบริหารส่วนตำบล (อบต.)');
    expect(pubRes.documentHash).toBe(ver.documentHash);
    // ไม่เปิดเผยชื่อผู้ขอในผลลัพธ์สาธารณะ เพื่อคุ้มครองข้อมูลส่วนบุคคล (PDPA)
    expect((pubRes as any).requesterName).toBeUndefined();
    expect((pubRes as any).organization).toBeUndefined();
  });

  it('4. ตรวจสอบผ่าน Public API ด้วย Token ที่ไม่มีในระบบ ส่งคืน NOT_FOUND', async () => {
    const pubRes = await service.verifyPublic('non-existent-token-12345');
    expect(pubRes.status).toBe('NOT_FOUND');
    expect(pubRes.message).toContain('ไม่พบข้อมูลเอกสาร');
  });

  it('5. ยกเลิกเอกสาร (Revoke) จะเปลี่ยนสถานะเป็น REVOKED และตรวจผ่าน Public API ได้สถานะ REVOKED', async () => {
    const ver = await service.createOrGetVerification('r-test-bk-1');
    await service.revokeVerification('r-test-bk-1', 'ยกเลิกเนื่องจากผู้ขอแจ้งขอยกเลิก');

    const pubRes = await service.verifyPublic(ver.verificationToken);
    expect(pubRes.status).toBe('REVOKED');
    expect(pubRes.revokedAt).toBeDefined();
    expect(pubRes.message).toContain('ถูกยกเลิกแล้ว');
  });

  it('6. เจ้าหน้าที่สแกนตรวจสอบ (Staff Verify) ได้ข้อมูลครบถ้วนพร้อมประวัติการสแกน', async () => {
    const ver = await service.createOrGetVerification('r-test-bk-1');

    const staffUser: any = {
      id: 's-suda',
      name: 'สุดา มีสุข',
      role: 'STAFF',
    };

    // เจ้าหน้าที่ค้นหาด้วยเลขที่เอกสารโดยตรง
    const staffRes = await service.verifyStaff('BK-2569-9999', staffUser);
    expect(staffRes.status).toBe('VALID');
    expect(staffRes.requesterName).toBe('สมชาย ใจดี');
    expect(staffRes.organization).toBe('ชุมชนบ้านน้ำชำ หมู่ 3');
    expect(staffRes.signatures?.length).toBe(3);

    // ประวัติการสแกนต้องถูกบันทึก
    const history = service.getVerifyHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].scannedByName).toBe('สุดา มีสุข');
    expect(history[0].result).toBe('VALID');
  });

  it('7. หากออกเอกสารฉบับใหม่ (Re-issue) เอกสารฉบับเก่าจะถูก REVOKED และได้ Version เพิ่มขึ้น', async () => {
    const ver1 = await service.createOrGetVerification('r-test-bk-1');
    expect(ver1.version).toBe(1);

    // จำลองการออกเอกสารใหม่ (forceNew)
    const ver2 = await service.createOrGetVerification('r-test-bk-1', { forceNew: true });
    expect(ver2.version).toBe(2);
    expect(ver2.status).toBe('VALID');

    // ตรวจสอบว่า token ฉบับเก่ากลายเป็น REVOKED
    const pubOld = await service.verifyPublic(ver1.verificationToken);
    expect(pubOld.status).toBe('REVOKED');

    // ตรวจสอบว่า token ฉบับใหม่เป็น VALID
    const pubNew = await service.verifyPublic(ver2.verificationToken);
    expect(pubNew.status).toBe('VALID');
  });
});

