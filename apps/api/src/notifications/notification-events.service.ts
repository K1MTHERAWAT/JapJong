import { Injectable, Logger } from '@nestjs/common';
import { BookingRequest, BorrowRequest, RepairRequest, SignLevel } from '@japjong/shared';
import { DbService } from '../db/db.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationEventsService {
  private readonly logger = new Logger(NotificationEventsService.name);

  constructor(
    private readonly db: DbService,
    private readonly notifications: NotificationsService,
  ) {}

  private getVenueNames(venueIds: string[]): string {
    if (!venueIds?.length) return 'สถานที่ราชการ';
    return venueIds
      .map((id) => this.db.venues.find((v) => v.id === id)?.name || id)
      .join(', ');
  }

  private getEquipmentSummary(items: { equipmentId: string; qty: number }[]): string {
    if (!items?.length) return 'อุปกรณ์ราชการ';
    return items
      .map((i) => {
        const eq = this.db.equipment.find((e) => e.id === i.equipmentId);
        return `${eq?.name || i.equipmentId} ×${i.qty}`;
      })
      .join(', ');
  }

  private formatBookingDate(req: BookingRequest): string {
    const first = req.periods?.[0];
    if (!first) return '-';
    return first.start.slice(0, 10);
  }

  // ===================== 5.1 ระบบจองสถานที่ราชการ =====================

  async onBookingCreated(req: BookingRequest) {
    try {
      const venueName = this.getVenueNames(req.venueIds);
      const dateText = this.formatBookingDate(req);

      // 1. แจ้งประชาชนผู้ยื่นคำขอ
      await this.notifications.dispatchToUser({
        userId: req.requesterId,
        event: 'BOOKING_SUBMITTED',
        recipientRole: 'CITIZEN',
        requestId: req.id,
        requestCode: req.code,
        venueName,
        dateText,
        eventKey: `booking_submitted:${req.id}:r${req.approvalRound || 1}`,
      });

      // 2. แจ้งเจ้าหน้าที่ (STAFF)
      await this.notifications.dispatchToRole(
        'STAFF',
        {
          event: 'STAFF_NEW_BOOKING',
          requestId: req.id,
          requestCode: req.code,
          requesterName: req.requesterName,
          venueName,
          dateText: req.createdAt.slice(0, 10),
        },
        `staff_new_booking:${req.id}:r${req.approvalRound || 1}`,
      );
    } catch (err) {
      this.logger.error('Error in onBookingCreated notification event', err);
    }
  }

  async onBookingRescheduled(req: BookingRequest) {
    try {
      const venueName = this.getVenueNames(req.venueIds);
      await this.notifications.dispatchToRole(
        'STAFF',
        {
          event: 'STAFF_BOOKING_RESCHEDULED',
          requestId: req.id,
          requestCode: req.code,
          requesterName: req.requesterName,
          venueName,
        },
        `staff_booking_rescheduled:${req.id}:r${req.approvalRound || 1}`,
      );
    } catch (err) {
      this.logger.error('Error in onBookingRescheduled notification event', err);
    }
  }

  // ===================== 5.2 ระบบยืม-คืนอุปกรณ์ =====================

  async onBorrowCreated(req: BorrowRequest) {
    try {
      const equipmentSummary = this.getEquipmentSummary(req.items);
      const dateText = `${req.pickupDate} ถึง ${req.returnDate}`;

      // 1. แจ้งประชาชนผู้ขอยืม
      await this.notifications.dispatchToUser({
        userId: req.requesterId,
        event: 'BORROW_SUBMITTED',
        recipientRole: 'CITIZEN',
        requestId: req.id,
        requestCode: req.code,
        equipmentSummary,
        dateText,
        eventKey: `borrow_submitted:${req.id}:r${req.approvalRound || 1}`,
      });

      // 2. แจ้งเจ้าหน้าที่ (STAFF)
      await this.notifications.dispatchToRole(
        'STAFF',
        {
          event: 'STAFF_NEW_BORROW',
          requestId: req.id,
          requestCode: req.code,
          requesterName: req.requesterName,
          equipmentSummary,
          dateText: req.createdAt.slice(0, 10),
        },
        `staff_new_borrow:${req.id}:r${req.approvalRound || 1}`,
      );
    } catch (err) {
      this.logger.error('Error in onBorrowCreated notification event', err);
    }
  }

  async onBorrowRescheduled(req: BorrowRequest) {
    try {
      const equipmentSummary = this.getEquipmentSummary(req.items);
      await this.notifications.dispatchToRole(
        'STAFF',
        {
          event: 'STAFF_NEW_BORROW',
          requestId: req.id,
          requestCode: req.code,
          requesterName: req.requesterName,
          equipmentSummary,
          dateText: `${req.pickupDate} ถึง ${req.returnDate}`,
        },
        `staff_borrow_rescheduled:${req.id}:r${req.approvalRound || 1}`,
      );
    } catch (err) {
      this.logger.error('Error in onBorrowRescheduled notification event', err);
    }
  }

  async onBorrowReturnRequested(req: BorrowRequest) {
    try {
      await this.notifications.dispatchToRole(
        'STAFF',
        {
          event: 'STAFF_BORROW_RETURN_REQUESTED',
          requestId: req.id,
          requestCode: req.code,
          requesterName: req.requesterName,
        },
        `staff_borrow_return_req:${req.id}:${req.returnRequestedAt || Date.now()}`,
      );
    } catch (err) {
      this.logger.error('Error in onBorrowReturnRequested notification event', err);
    }
  }

  async onBorrowReturned(req: BorrowRequest) {
    try {
      await this.notifications.dispatchToUser({
        userId: req.requesterId,
        event: 'BORROW_RETURNED',
        recipientRole: 'CITIZEN',
        requestId: req.id,
        requestCode: req.code,
        eventKey: `borrow_returned:${req.id}`,
      });
    } catch (err) {
      this.logger.error('Error in onBorrowReturned notification event', err);
    }
  }

  // ===================== 5.3 ระบบแจ้งปัญหาและซ่อมบำรุง =====================

  async onRepairCreated(req: RepairRequest) {
    try {
      // 1. แจ้งประชาชนผู้แจ้งซ่อม
      await this.notifications.dispatchToUser({
        userId: req.requesterId,
        event: 'REPAIR_SUBMITTED',
        recipientRole: 'CITIZEN',
        requestId: req.id,
        requestCode: req.code,
        location: req.location,
        eventKey: `repair_submitted:${req.id}`,
      });

      // 2. แจ้งเจ้าหน้าที่ (STAFF)
      await this.notifications.dispatchToRole(
        'STAFF',
        {
          event: 'STAFF_NEW_REPAIR',
          requestId: req.id,
          requestCode: req.code,
          requesterName: req.requesterName,
          location: req.location,
        },
        `staff_new_repair:${req.id}`,
      );
    } catch (err) {
      this.logger.error('Error in onRepairCreated notification event', err);
    }
  }

  async onRepairStatusUpdated(
    req: RepairRequest,
    action: 'accept' | 'finish' | 'confirm' | 'reopen' | 'reject',
  ) {
    try {
      if (action === 'accept') {
        await this.notifications.dispatchToUser({
          userId: req.requesterId,
          event: 'REPAIR_IN_PROGRESS',
          recipientRole: 'CITIZEN',
          requestId: req.id,
          requestCode: req.code,
          location: req.location,
          eventKey: `repair_accept:${req.id}:${req.acceptedAt || Date.now()}`,
        });
      } else if (action === 'reject') {
        await this.notifications.dispatchToUser({
          userId: req.requesterId,
          event: 'REPAIR_REJECTED',
          recipientRole: 'CITIZEN',
          requestId: req.id,
          requestCode: req.code,
          location: req.location,
          reason: req.rejectReason || 'เจ้าหน้าที่ส่งกลับ / ไม่รับเรื่องซ่อม',
          eventKey: `repair_reject:${req.id}:${req.updatedAt || Date.now()}`,
        });
      } else if (action === 'finish') {
        await this.notifications.dispatchToUser({
          userId: req.requesterId,
          event: 'REPAIR_FINISHED',
          recipientRole: 'CITIZEN',
          requestId: req.id,
          requestCode: req.code,
          location: req.location,
          statusLabel: req.resolution || 'ดำเนินการซ่อมเรียบร้อย',
          eventKey: `repair_finish:${req.id}:${req.finishedAt || Date.now()}`,
        });
      } else if (action === 'confirm') {
        await this.notifications.dispatchToUser({
          userId: req.requesterId,
          event: 'REPAIR_DONE',
          recipientRole: 'CITIZEN',
          requestId: req.id,
          requestCode: req.code,
          location: req.location,
          eventKey: `repair_done:${req.id}`,
        });
        await this.notifications.dispatchToRole(
          'STAFF',
          {
            event: 'STAFF_REPAIR_CONFIRMED',
            requestId: req.id,
            requestCode: req.code,
            location: req.location,
          },
          `staff_repair_confirmed:${req.id}`,
        );
      } else if (action === 'reopen') {
        await this.notifications.dispatchToRole(
          'STAFF',
          {
            event: 'STAFF_REPAIR_REOPENED',
            requestId: req.id,
            requestCode: req.code,
            location: req.location,
          },
          `staff_repair_reopened:${req.id}:${req.updatedAt}`,
        );
      }
    } catch (err) {
      this.logger.error('Error in onRepairStatusUpdated notification event', err);
    }
  }

  // ===================== 5.4 การพิจารณาและลงนามเอกสาร (3 ระดับ) =====================

  async onRequestSigned(
    req: BookingRequest | BorrowRequest,
    level: SignLevel,
    decision: 'approve' | 'reject',
    rejectReason?: string,
  ) {
    try {
      const round = req.approvalRound || 1;
      const venueName = req.type === 'booking' ? this.getVenueNames(req.venueIds) : undefined;
      const equipmentSummary = req.type === 'borrow' ? this.getEquipmentSummary(req.items) : undefined;
      const dateText =
        req.type === 'booking'
          ? this.formatBookingDate(req)
          : `${req.pickupDate} ถึง ${req.returnDate}`;

      if (decision === 'reject') {
        await this.notifications.dispatchToUser({
          userId: req.requesterId,
          event: req.type === 'booking' ? 'BOOKING_REJECTED' : 'BORROW_REJECTED',
          recipientRole: 'CITIZEN',
          requestId: req.id,
          requestCode: req.code,
          venueName,
          equipmentSummary,
          reason: rejectReason || req.rejectReason || 'ไม่ผ่านการพิจารณา',
          eventKey: `req_rejected:${req.id}:r${round}:${level}`,
        });
        return;
      }

      if (level === 'staff') {
        // แจ้งปลัด (APPROVER_L2) รอเห็นชอบ
        await this.notifications.dispatchToRole(
          'APPROVER_L2',
          {
            event: 'STAFF_SIGNING_REQUIRED',
            requestId: req.id,
            requestCode: req.code,
            requesterName: req.requesterName,
            statusLabel: 'รอเห็นชอบ',
          },
          `signing_l2:${req.id}:r${round}`,
        );
      } else if (level === 'l2') {
        // แจ้งนายก (APPROVER_L1) รออนุมัติ
        await this.notifications.dispatchToRole(
          'APPROVER_L1',
          {
            event: 'STAFF_SIGNING_REQUIRED',
            requestId: req.id,
            requestCode: req.code,
            requesterName: req.requesterName,
            statusLabel: 'รออนุมัติ',
          },
          `signing_l1:${req.id}:r${round}`,
        );
      } else if (level === 'l1') {
        // อนุมัติครบถ้วน -> แจ้งผู้ยื่นคำขอ
        await this.notifications.dispatchToUser({
          userId: req.requesterId,
          event: req.type === 'booking' ? 'BOOKING_APPROVED' : 'BORROW_APPROVED',
          recipientRole: 'CITIZEN',
          requestId: req.id,
          requestCode: req.code,
          venueName,
          equipmentSummary,
          dateText,
          eventKey: `req_approved:${req.id}:r${round}`,
        });
      }
    } catch (err) {
      this.logger.error('Error in onRequestSigned notification event', err);
    }
  }
}

