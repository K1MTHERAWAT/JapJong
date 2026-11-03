import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DocumentsController } from './documents.controller';
import { PublicVerifyController } from './public-verify.controller';
import { StaffVerifyController } from './staff-verify.controller';
import { Account } from '@jongwen/shared';

describe('Documents & Verification Controllers Unit Tests', () => {
  let mockDocumentsService: any;
  let docsController: DocumentsController;
  let publicController: PublicVerifyController;
  let staffController: StaffVerifyController;

  const testStaff: Account = {
    id: 'u-staff-01',
    username: 'staff01',
    password: 'hash',
    name: 'สุดา มีสุข',
    nickname: 'ดา',
    initial: 'ส',
    role: 'STAFF',
    position: 'เจ้าหน้าที่',
    department: 'ธุรการ',
    phone: '0811111111',
    permissions: {
      review: true,
      handover: true,
      walkIn: true,
      manageResources: false,
      sign: false,
      manageUsers: false,
    },
    signature: null,
    pin: null,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockDocumentsService = {
      createOrGetVerification: vi.fn().mockResolvedValue({
        id: 'ver-01',
        documentId: 'req-01',
        verificationToken: 'token123',
        status: 'VALID',
        qrCodeDataUrl: 'data:image/png;base64,...',
      }),
      getVerificationByDocumentId: vi.fn().mockResolvedValue({
        id: 'ver-01',
        documentId: 'req-01',
        status: 'VALID',
      }),
      revokeVerification: vi.fn().mockResolvedValue({
        id: 'ver-01',
        status: 'REVOKED',
      }),
      verifyPublic: vi.fn().mockResolvedValue({
        status: 'VALID',
        documentNumber: 'BK-2569-0001',
        issuingOrg: 'องค์การบริหารส่วนตำบล (อบต.)',
      }),
      getVerifyHistory: vi.fn().mockResolvedValue([
        { id: 'log-01', result: 'VALID', scannedByName: 'สุดา มีสุข' },
      ]),
      verifyStaff: vi.fn().mockResolvedValue({
        status: 'VALID',
        documentNumber: 'BK-2569-0001',
        verification: { status: 'VALID' },
      }),
    };

    docsController = new DocumentsController(mockDocumentsService);
    publicController = new PublicVerifyController(mockDocumentsService);
    staffController = new StaffVerifyController(mockDocumentsService);
  });

  describe('DocumentsController', () => {
    it('creates or gets verification record and QR code', async () => {
      const res = await docsController.createVerification('req-01', {
        documentType: 'booking_form',
      });
      expect(res.id).toBe('ver-01');
      expect(mockDocumentsService.createOrGetVerification).toHaveBeenCalledWith('req-01', {
        documentType: 'booking_form',
      });
    });

    it('retrieves verification record by document id', async () => {
      const res = await docsController.getVerification('req-01');
      expect(res.status).toBe('VALID');
      expect(mockDocumentsService.getVerificationByDocumentId).toHaveBeenCalledWith('req-01');
    });

    it('revokes verification with reason and user', async () => {
      const res = await docsController.revokeVerification('req-01', 'ยกเลิกคำขอ', testStaff);
      expect(res.status).toBe('REVOKED');
      expect(mockDocumentsService.revokeVerification).toHaveBeenCalledWith('req-01', 'ยกเลิกคำขอ', testStaff);
    });
  });

  describe('PublicVerifyController', () => {
    it('verifies document publicly without auth', async () => {
      const mockReq: any = {
        headers: { 'user-agent': 'Mobile Safari' },
        socket: { remoteAddress: '127.0.0.1' },
      };
      const res = await publicController.verifyDocument('token123', mockReq);
      expect(res.status).toBe('VALID');
      expect(mockDocumentsService.verifyPublic).toHaveBeenCalledWith('token123', '127.0.0.1', 'Mobile Safari');
    });
  });

  describe('StaffVerifyController', () => {
    it('returns staff verify history with limit', async () => {
      const history = await staffController.getVerifyHistory('10');
      expect(history.length).toBe(1);
      expect(mockDocumentsService.getVerifyHistory).toHaveBeenCalledWith(10);
    });

    it('verifies document for staff with detailed response and scan log', async () => {
      const mockReq: any = {
        headers: { 'user-agent': 'Chrome Android' },
        socket: { remoteAddress: '192.168.1.10' },
      };
      const res = await staffController.verifyDocument('BK-2569-0001', testStaff, mockReq);
      expect(res.status).toBe('VALID');
      expect(mockDocumentsService.verifyStaff).toHaveBeenCalledWith(
        'BK-2569-0001',
        testStaff,
        '192.168.1.10',
        'Chrome Android',
      );
    });
  });
});

