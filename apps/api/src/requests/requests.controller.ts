import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Account,
  AnyRequest,
  BookingRequest,
  BorrowRequest,
  ItemQty,
  Period,
  RepairRequest,
  RequestType,
  ROLE_LABEL,
  SIGN_LEVEL_TITLE,
  SignLevel,
  canSignRequest,
  hasPermission,
  overlaps,
  withTimeline,
} from '@jongwen/shared';
import {
  CurrentUser,
  Permissions,
  assertNotLocked,
  clearFailures,
  recordFailure,
  requireDrawnSignature,
} from '../auth/auth.guard';
import { verifySecret } from '../auth/secret';
import { DbService } from '../db/db.service';
import { NotificationEventsService } from '../notifications/notification-events.service';
import {
  CreateBookingDto,
  CreateBorrowDto,
  CreateRepairDto,
  HandoverDto,
  RepairStatusDto,
  RescheduleDto,
  SignDto,
} from './dto';

class AsyncMutex {
  private queue = Promise.resolve();

  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const res = this.queue.then(fn, fn);
    this.queue = res.then(() => {}, () => {});
    return res;
  }
}

@Controller('requests')
export class RequestsController {
  private readonly bookingMutex = new AsyncMutex();

  constructor(
    private readonly db: DbService,
    @Optional() private readonly notificationEvents?: NotificationEventsService,
  ) {}

  private sanitizeItems(items: unknown): ItemQty[] {
    if (!Array.isArray(items)) return [];
    const cleaned: ItemQty[] = [];
    for (const raw of items.slice(0, 30)) {
      if (!raw || typeof raw !== 'object') continue;
      const equipmentId = String((raw as ItemQty).equipmentId ?? '').trim();
      const qty = Math.floor(Number((raw as ItemQty).qty ?? 0));
      const eq = this.db.equipment.find((e) => e.id === equipmentId && e.enabled);
      if (!eq) continue;
      if (!Number.isFinite(qty) || qty < 1 || qty > eq.stock) {
        throw new BadRequestException(`จำนวนอุปกรณ์ "${eq.name}" ต้องอยู่ระหว่าง 1 ถึง ${eq.stock}`);
      }
      cleaned.push({ equipmentId: eq.id, qty });
    }
    return cleaned;
  }

  private validatePeriodsAndVenues(venueIds: string[], periods: Period[], excludeRequestId?: string) {
    if (!venueIds.length || !periods.length || periods.length > 20) {
      throw new BadRequestException('กรุณาเลือกสถานที่และวันเวลา');
    }

    const venues = this.db.venues.filter((v) => venueIds.includes(v.id) && v.enabled);
    if (venues.length !== venueIds.length) {
      throw new BadRequestException('มีสถานที่บางแห่งที่ปิดปรับปรุงหรือไม่พร้อมใช้งาน');
    }

    const now = new Date();
    // เวลาไทย (UTC+7) ณ 00:00:00 น.
    const bkkNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayBkkMidnight = Date.UTC(bkkNow.getUTCFullYear(), bkkNow.getUTCMonth(), bkkNow.getUTCDate());

    for (const p of periods) {
      const s = new Date(p?.start).getTime();
      const e = new Date(p?.end).getTime();
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
        throw new BadRequestException('ช่วงวันเวลาไม่ถูกต้อง');
      }

      // แปลงช่วงเวลาของคำขอเป็นเวลาไทย (UTC+7)
      const startBkk = new Date(s + 7 * 60 * 60 * 1000);
      const endBkk = new Date(e + 7 * 60 * 60 * 1000);

      const startDayBkk = Date.UTC(startBkk.getUTCFullYear(), startBkk.getUTCMonth(), startBkk.getUTCDate());
      const dayDiff = Math.floor((startDayBkk - todayBkkMidnight) / (24 * 60 * 60 * 1000));
      const dayOfWeek = startBkk.getUTCDay(); // 0 = อาทิตย์ ... 6 = เสาร์

      const startH = String(startBkk.getUTCHours()).padStart(2, '0');
      const startM = String(startBkk.getUTCMinutes()).padStart(2, '0');
      const endH = String(endBkk.getUTCHours()).padStart(2, '0');
      const endM = String(endBkk.getUTCMinutes()).padStart(2, '0');
      const startTimeStr = `${startH}:${startM}`;
      const endTimeStr = `${endH}:${endM}`;

      for (const v of venues) {
        // 1. วันจองล่วงหน้า (advanceDays)
        if (v.advanceDays > 0 && dayDiff < v.advanceDays) {
          throw new BadRequestException(
            `สถานที่ "${v.name}" ต้องจองล่วงหน้าอย่างน้อย ${v.advanceDays} วัน (วันที่เลือกเร็วเกินไป)`,
          );
        }

        // 2. วันที่เปิดให้บริการ (openDays)
        if (v.openDays && v.openDays.length > 0 && !v.openDays.includes(dayOfWeek)) {
          const thaiDayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
          throw new BadRequestException(
            `สถานที่ "${v.name}" ไม่เปิดให้บริการในวัน${thaiDayNames[dayOfWeek]}`,
          );
        }

        // 3. เวลาเปิด-ปิดทำการ (openTime / closeTime)
        if (v.openTime && startTimeStr < v.openTime) {
          throw new BadRequestException(
            `เวลาเริ่มต้น (${startTimeStr} น.) เร็วกว่าเวลาเปิดทำการของ "${v.name}" (${v.openTime} น.)`,
          );
        }
        if (v.closeTime && endTimeStr > v.closeTime) {
          throw new BadRequestException(
            `เวลาสิ้นสุด (${endTimeStr} น.) เกินเวลาปิดทำการของ "${v.name}" (${v.closeTime} น.)`,
          );
        }
      }
    }

    // 4. ตรวจสอบการจองซ้อนทับ (Booking Conflict) กับคำขอที่กำลังดำเนินการหรืออนุมัติแล้ว
    const activeBookings = this.db.requests.filter(
      (r): r is BookingRequest =>
        r.type === 'booking' &&
        ['pending_staff', 'pending_l2', 'pending_l1', 'approved'].includes(r.status) &&
        r.id !== excludeRequestId &&
        r.venueIds.some((v) => venueIds.includes(v)),
    );

    for (const p of periods) {
      for (const b of activeBookings) {
        for (const bp of b.periods) {
          if (overlaps(p, bp)) {
            const conflictVenueId = b.venueIds.find((v) => venueIds.includes(v))!;
            const venueName = this.db.venues.find((v) => v.id === conflictVenueId)?.name || conflictVenueId;
            throw new ConflictException(
              `สถานที่ "${venueName}" มีการจองซ้อนทับแล้วในช่วงเวลาดังกล่าว (คำขอ ${b.code})`,
            );
          }
        }
      }
    }
  }

  private validateBorrowInventory(
    items: ItemQty[],
    pickupDate: string,
    returnDate: string,
    excludeRequestId?: string,
  ) {
    const pick = new Date(pickupDate).getTime();
    const ret = new Date(returnDate).getTime();
    if (!Number.isFinite(pick) || !Number.isFinite(ret) || ret < pick) {
      throw new BadRequestException('วันที่รับและคืนไม่ถูกต้อง');
    }

    // คำขอยืมอุปกรณ์ที่กำลังใช้งานและจองสต็อกคงคลังอยู่
    const activeBorrows = this.db.requests.filter(
      (r): r is BorrowRequest =>
        r.type === 'borrow' &&
        ['pending_staff', 'pending_l2', 'pending_l1', 'approved', 'borrowing', 'return_inspect'].includes(r.status) &&
        r.id !== excludeRequestId,
    );

    // คำขอจองสถานที่ที่มีอุปกรณ์เสริม (extraItems)
    const activeBookingsWithItems = this.db.requests.filter(
      (r): r is BookingRequest =>
        r.type === 'booking' &&
        ['pending_staff', 'pending_l2', 'pending_l1', 'approved'].includes(r.status) &&
        r.id !== excludeRequestId &&
        Boolean(r.extraItems && r.extraItems.length > 0),
    );

    // ตรวจสอบช่วงวันที่ทับซ้อน: pickupA <= returnB && pickupB <= returnA
    const overlappingBorrows = activeBorrows.filter(
      (b) => b.pickupDate <= returnDate && b.returnDate >= pickupDate,
    );
    const overlappingBookings = activeBookingsWithItems.filter((b) => {
      const dates = b.periods.flatMap((p) => [p.start.slice(0, 10), p.end.slice(0, 10)]).sort();
      if (dates.length === 0) return false;
      return dates[0] <= returnDate && dates[dates.length - 1] >= pickupDate;
    });

    for (const item of items) {
      const eq = this.db.equipment.find((e) => e.id === item.equipmentId && e.enabled);
      if (!eq) throw new BadRequestException(`ไม่พบอุปกรณ์รหัส ${item.equipmentId}`);

      const reservedInBorrows = overlappingBorrows.reduce((sum, b) => {
        const found = b.items.find((i) => i.equipmentId === eq.id);
        return sum + (found ? found.qty : 0);
      }, 0);

      const reservedInBookings = overlappingBookings.reduce((sum, b) => {
        const found = b.extraItems.find((i) => i.equipmentId === eq.id);
        return sum + (found ? found.qty : 0);
      }, 0);

      const currentlyReserved = reservedInBorrows + reservedInBookings;
      const available = eq.stock - currentlyReserved;
      if (item.qty > available) {
        throw new ConflictException(
          `อุปกรณ์ "${eq.name}" ในช่วงวันที่ ${pickupDate} ถึง ${returnDate} มีคงเหลือให้ยืมเพียง ${Math.max(0, available)} ชิ้น (ถูกยืม/จองแล้ว ${currentlyReserved} จากทั้งหมด ${eq.stock} ชิ้น)`,
        );
      }
    }
  }

  private enrich(req: AnyRequest) {
    const handovers = this.db.handovers.filter((h) => h.requestId === req.id);
    const handoverBefore = [...handovers].reverse().find((h) => h.phase === 'before');
    const handoverAfter = [...handovers].reverse().find((h) => h.phase === 'after');
    return {
      ...withTimeline(req, this.db.venues, this.db.equipment),
      handovers,
      handoverBefore,
      handoverAfter,
    };
  }

  @Get()
  list(
    @CurrentUser() user: Account,
    @Query('mine') mine?: string,
    @Query('type') type?: RequestType,
    @Query('queue') queue?: 'staff' | 'l2' | 'l1' | 'handover',
  ) {
    let items = [...this.db.requests];

    if (mine === '1') {
      // ของใครของมัน:
      // 1. ถ้าเป็นผู้ยื่นคำขอเอง หรือเป็นเจ้าหน้าที่ที่กรอกแทน
      // 2. ถ้าเป็นเจ้าหน้าที่ / ผู้อนุมัติ L2 / ผู้อนุมัติ L1: ให้รวมคำขอที่ส่งมาถึงตนเองตามสายงาน หรือคำขอที่ตนเองเคยลงนามแล้ว
      items = items.filter((r) => {
        if (r.requesterId === user.id || r.createdByStaffId === user.id) return true;

        if (user.role === 'STAFF') {
          // คำขอที่ส่งมาถึงเจ้าหน้าที่ หรือเจ้าหน้าที่เคยลงนามแล้ว
          const signed = r.type !== 'repair' && r.signatures.some((s) => s.signerId === user.id || s.level === 'staff');
          const isQueue = ['pending_staff', 'repair_submitted', 'repair_in_progress'].includes(r.status);
          const isRepairAssigned = r.type === 'repair' && (r.staffSignature || r.staffSignerName);
          return signed || isQueue || isRepairAssigned;
        }

        if (user.role === 'APPROVER_L2') {
          // คำขอที่ส่งมาถึงปลัด อบต. (pending_l2) หรือปลัดเคยลงนามแล้ว
          const signed = r.type !== 'repair' && r.signatures.some((s) => s.signerId === user.id || s.level === 'l2');
          const isQueue = r.status === 'pending_l2';
          return signed || isQueue;
        }

        if (user.role === 'APPROVER_L1') {
          // คำขอที่ส่งมาถึงนายก อบต. (pending_l1) หรือนายกเคยลงนามแล้ว
          const signed = r.type !== 'repair' && r.signatures.some((s) => s.signerId === user.id || s.level === 'l1');
          const isQueue = r.status === 'pending_l1';
          return signed || isQueue;
        }

        return false;
      });
    } else if (user.role === 'USER') {
      items = items.filter((r) => r.requesterId === user.id);
    }
    if (type) items = items.filter((r) => r.type === type);
    if (queue === 'staff') {
      items = items.filter((r) =>
        ['pending_staff', 'repair_submitted', 'repair_in_progress'].includes(r.status),
      );
    } else if (queue === 'l2') {
      items = items.filter((r) => r.status === 'pending_l2');
    } else if (queue === 'l1') {
      items = items.filter((r) => r.status === 'pending_l1');
    } else if (queue === 'handover') {
      items = items.filter(
        (r) =>
          (r.type === 'booking' && r.status === 'approved') ||
          (r.type === 'borrow' && ['approved', 'borrowing', 'return_inspect'].includes(r.status)),
      );
    }
    return items
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((r) => this.enrich(r));
  }

  @Get(':id')
  getOne(@CurrentUser() user: Account, @Param('id') id: string) {
    const req = this.db.requests.find((r) => r.id === id || r.code === id);
    if (!req) throw new NotFoundException('ไม่พบคำขอ');
    // ป้องกัน IDOR: ผู้ใช้ทั่วไปเห็นได้เฉพาะคำขอของตนเอง
    const isOfficer =
      hasPermission(user, 'review') || hasPermission(user, 'handover') || hasPermission(user, 'sign');
    if (!isOfficer && req.requesterId !== user.id) throw new NotFoundException('ไม่พบคำขอ');
    return this.enrich(req);
  }

  @Post('booking')
  async createBooking(
    @CurrentUser() user: Account,
    @Body() body: CreateBookingDto,
  ) {
    return this.bookingMutex.runExclusive(async () => {
      const venueIds = Array.isArray(body.venueIds) ? body.venueIds : [];
      const periods = Array.isArray(body.periods) ? body.periods : [];
      this.validatePeriodsAndVenues(venueIds, periods);

      // ตรวจสอบความจุสถานที่ (Venue Capacity)
      for (const vId of venueIds) {
        const v = this.db.venues.find((item) => item.id === vId);
        if (v && v.capacity > 0 && body.attendees && body.attendees > v.capacity) {
          throw new BadRequestException(
            `จำนวนผู้เข้าร่วม (${body.attendees} คน) เกินความจุของสถานที่ "${v.name}" (รองรับได้สูงสุด ${v.capacity} คน)`,
          );
        }
      }

      const requesterSig = requireDrawnSignature(body.requesterSignature, 'ผู้ขอใช้สถานที่');

      const isWalkIn =
        Boolean(body.createdByStaffSignature) ||
        Boolean(body.requesterId && body.requesterId !== user.id);
      if (isWalkIn && !hasPermission(user, 'walkIn')) {
        throw new ForbiddenException(
          'ไม่มีสิทธิ์กรอกคำขอแทนผู้มาติดต่อ (Walk-in): ต้องเปิดสิทธิ์ "กรอกคำขอแทนผู้มาติดต่อหน้าเคาน์เตอร์"',
        );
      }
      if (isWalkIn && body.requesterId && !this.db.accounts.some((a) => a.id === body.requesterId)) {
        throw new BadRequestException('ไม่พบผู้ใช้ที่ระบุ');
      }
      const staffSig = isWalkIn ? requireDrawnSignature(body.createdByStaffSignature, 'เจ้าหน้าที่ผู้กรอกแทน') : undefined;

      const extraItems = this.sanitizeItems(body.extraItems);
      if (extraItems.length > 0) {
        const dates = periods.flatMap((p) => [p.start.slice(0, 10), p.end.slice(0, 10)]).sort();
        this.validateBorrowInventory(extraItems, dates[0], dates[dates.length - 1]);
      }

      const now = new Date().toISOString();
      const code = await this.db.nextCode('BK');

      // ตรวจสอบความซ้ำซ้อนอีกครั้งก่อนบันทึกแบบ atomic
      this.validatePeriodsAndVenues(venueIds, periods);

      const req: BookingRequest = {
        id: `r-${code.toLowerCase()}`,
        code,
        type: 'booking',
        status: 'pending_staff',
        approvalRound: 1,
        requesterId: isWalkIn ? body.requesterId ?? user.id : user.id,
        requesterName: body.requesterName?.trim() || user.name,
        requesterSignature: requesterSig,
        organization: String(body.organization ?? '').slice(0, 200) || user.department,
        createdAt: now,
        updatedAt: now,
        createdByStaffId: isWalkIn ? user.id : undefined,
        createdByStaffSignature: staffSig,
        venueIds,
        periods: periods.map((p) => ({ start: p.start, end: p.end })),
        attendees: Math.max(1, Math.min(10000, Math.floor(Number(body.attendees ?? 30)) || 30)),
        activity: String(body.activity ?? '').trim().slice(0, 200) || 'ขอใช้สถานที่',
        purpose: String(body.purpose ?? '').trim().slice(0, 1000) || 'ใช้จัดกิจกรรม',
        attachments: (body.attachments ?? []).slice(0, 10).map((a) => String(a).slice(0, 200)),
        extraItems,
        signatures: [],
        writtenAt: body.writtenAt ? String(body.writtenAt).slice(0, 120) : '',
        requesterPosition: body.requesterPosition ? String(body.requesterPosition).slice(0, 120) : (user.position || ''),
        addressHouseNo: body.addressHouseNo ? String(body.addressHouseNo).slice(0, 40) : '',
        addressMoo: body.addressMoo ? String(body.addressMoo).slice(0, 20) : '',
        addressSubdistrict: body.addressSubdistrict ? String(body.addressSubdistrict).slice(0, 80) : '',
        addressDistrict: body.addressDistrict ? String(body.addressDistrict).slice(0, 80) : '',
        addressProvince: body.addressProvince ? String(body.addressProvince).slice(0, 80) : '',
        purposeItems: Array.isArray(body.purposeItems)
          ? body.purposeItems.slice(0, 20).map((pi) => ({
              item: String(pi?.item ?? '').slice(0, 200),
              forWhat: String(pi?.forWhat ?? '').slice(0, 300),
            }))
          : undefined,
      };
      this.db.requests.unshift(req);
      await this.db.persistRequest(req);
      if (this.notificationEvents) {
        await this.notificationEvents.onBookingCreated(req);
      } else {
        this.db.notifyRole('STAFF', 'มีคำขอจองสถานที่ใหม่', `${req.code} · ${req.requesterName}`, `/staff/review?id=${req.id}`);
      }
      await this.db.log('request', `ส่งคำขอจอง ${req.code}`, req.requesterName, {
        id: user.id,
        name: user.name,
        role: user.role,
      });
      return this.enrich(req);
    });
  }

  @Post('borrow')
  async createBorrow(
    @CurrentUser() user: Account,
    @Body() body: CreateBorrowDto,
  ) {
    return this.bookingMutex.runExclusive(async () => {
      const items = this.sanitizeItems(body.items);
      if (!items.length) throw new BadRequestException('กรุณาเลือกอุปกรณ์อย่างน้อย 1 รายการ');
      const pickupDate = String(body.pickupDate ?? '').slice(0, 10);
      const returnDate = String(body.returnDate ?? '').slice(0, 10);
      this.validateBorrowInventory(items, pickupDate, returnDate);

      const isWalkIn =
        Boolean(body.createdByStaffSignature) ||
        Boolean(body.requesterId && body.requesterId !== user.id);

      if (isWalkIn && !hasPermission(user, 'walkIn')) {
        throw new ForbiddenException('ไม่มีสิทธิ์กรอกคำขอแทนที่เคาน์เตอร์');
      }

      const requesterSig = requireDrawnSignature(body.requesterSignature, 'ผู้ขอยืม');
      const staffSig = isWalkIn ? requireDrawnSignature(body.createdByStaffSignature, 'เจ้าหน้าที่ผู้กรอกแทน') : undefined;

      const now = new Date().toISOString();
      const code = await this.db.nextCode('BR');

      // ตรวจสอบสต็อกซ้ำอีกครั้งก่อนบันทึกแบบ atomic
      this.validateBorrowInventory(items, pickupDate, returnDate);

      const req: BorrowRequest = {
        id: `r-${code.toLowerCase()}`,
        code,
        type: 'borrow',
        status: 'pending_staff',
        approvalRound: 1,
        requesterId: isWalkIn ? body.requesterId ?? user.id : user.id,
        requesterName: body.requesterName?.trim() || user.name,
        requesterSignature: requesterSig,
        organization: String(body.organization ?? '').slice(0, 200) || user.department,
        createdAt: now,
        updatedAt: now,
        createdByStaffId: isWalkIn ? user.id : undefined,
        createdByStaffSignature: staffSig,
        items,
        pickupDate: String(body.pickupDate).slice(0, 10),
        returnDate: String(body.returnDate).slice(0, 10),
        purpose: String(body.purpose ?? '').trim().slice(0, 1000) || 'ใช้งานกิจกรรมในพื้นที่',
        attachments: (body.attachments ?? []).slice(0, 10).map((a) => String(a).slice(0, 200)),
        signatures: [],
        writtenAt: body.writtenAt ? String(body.writtenAt).slice(0, 150) : '',
        requesterPosition: body.requesterPosition ? String(body.requesterPosition).slice(0, 100) : (user.position || ''),
        addressHouseNo: body.addressHouseNo ? String(body.addressHouseNo).slice(0, 40) : (user.addressHouseNo ?? ''),
        addressMoo: body.addressMoo ? String(body.addressMoo).slice(0, 20) : (user.addressMoo ?? ''),
        addressSubdistrict: body.addressSubdistrict ? String(body.addressSubdistrict).slice(0, 80) : (user.addressSubdistrict ?? ''),
        addressDistrict: body.addressDistrict ? String(body.addressDistrict).slice(0, 80) : (user.addressDistrict ?? ''),
        addressProvince: body.addressProvince ? String(body.addressProvince).slice(0, 80) : (user.addressProvince ?? ''),
        purposeItems: Array.isArray(body.purposeItems)
          ? body.purposeItems.slice(0, 20).map((pi) => ({
              item: String(pi?.item ?? '').slice(0, 200),
              forWhat: String(pi?.forWhat ?? '').slice(0, 300),
            }))
          : undefined,
      };
      this.db.requests.unshift(req);
      await this.db.persistRequest(req);
      if (this.notificationEvents) {
        await this.notificationEvents.onBorrowCreated(req);
      } else {
        this.db.notifyRole('STAFF', 'มีคำขอยืมครุภัณฑ์ใหม่', `${req.code} · ${req.requesterName}`, `/staff/review?id=${req.id}`);
      }
      await this.db.log('request', `ส่งคำขอยืม ${req.code}`, req.requesterName, {
        id: user.id,
        name: user.name,
        role: user.role,
      });
      return this.enrich(req);
    });
  }

  @Post('repair')
  async createRepair(
    @CurrentUser() user: Account,
    @Body() body: CreateRepairDto,
  ) {
    if (!body.detail?.trim()) throw new BadRequestException('กรุณาระบุรายละเอียดอาการ');

    const isWalkIn =
      Boolean(body.createdByStaffSignature) ||
      Boolean(body.requesterId && body.requesterId !== user.id) ||
      Boolean(body.requesterName && body.requesterName.trim() !== user.name);

    if (isWalkIn && !hasPermission(user, 'walkIn')) {
      throw new ForbiddenException('ไม่มีสิทธิ์กรอกคำขอแทนที่เคาน์เตอร์');
    }

    // Policy: งานแจ้งซ่อมจากประชาชนเป็น fast-ticket ช่องทางด่วน ไม่บังคับลายเซ็น/PIN
    const requesterSig = body.requesterSignature ? requireDrawnSignature(body.requesterSignature, 'ผู้แจ้งซ่อม') : undefined;
    const staffSig = isWalkIn && body.createdByStaffSignature ? requireDrawnSignature(body.createdByStaffSignature, 'เจ้าหน้าที่ผู้กรอกแทน') : undefined;

    const now = new Date().toISOString();
    const code = await this.db.nextCode('RP');
    const req: RepairRequest = {
      id: `r-${code.toLowerCase()}`,
      code,
      type: 'repair',
      status: 'repair_submitted',
      approvalRound: 1,
      requesterId: isWalkIn ? body.requesterId ?? user.id : user.id,
      requesterName: (isWalkIn ? body.requesterName?.trim() : '') || user.name,
      requesterSignature: requesterSig,
      organization: String(body.organization ?? '').slice(0, 200) || user.department,
      createdAt: now,
      updatedAt: now,
      createdByStaffId: isWalkIn ? user.id : undefined,
      createdByStaffSignature: staffSig,
      building: String(body.building ?? '').slice(0, 100) || 'อาคารสำนักงาน',
      floor: String(body.floor ?? '').slice(0, 50) || 'ชั้น 1',
      location: String(body.location ?? '').slice(0, 200) || 'ทั่วไป',
      category: String(body.category ?? '').slice(0, 50) || 'อื่น ๆ',
      detail: body.detail.trim().slice(0, 2000),
      photos: Math.max(0, Math.min(3, Math.floor(Number(body.photos ?? 0)) || 0)),
    };
    this.db.requests.unshift(req);
    await this.db.persistRequest(req);
    if (this.notificationEvents) {
      await this.notificationEvents.onRepairCreated(req);
    } else {
      this.db.notifyRole('STAFF', 'แจ้งซ่อมใหม่', `${req.code} · ${req.location}`, `/staff/review?id=${req.id}`);
    }
    await this.db.log('request', `แจ้งซ่อม ${req.code}`, req.location, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return this.enrich(req);
  }

  /** ลงนาม / อนุมัติ 3 ระดับ (เจ้าหน้าที่ → ปลัด L2 → นายก L1) */
  @Permissions('review', 'sign')
  @Post(':id/sign')
  async sign(
    @CurrentUser() user: Account,
    @Param('id') id: string,
    @Body() body: SignDto,
    @Req() reqHttp: any,
  ) {
    const req = this.db.requests.find((r) => r.id === id || r.code === id);
    if (!req || req.type === 'repair') throw new NotFoundException('ไม่พบคำขอที่ต้องลงนาม');

    const check = canSignRequest(user, req);
    if (!check.allowed || !check.expectedLevel) {
      throw new ForbiddenException(check.reason || 'ไม่มีสิทธิ์ลงนามคำขอนี้ในระดับปัจจุบัน');
    }

    // Separation of Duties (SoD): ห้ามตนเองอนุมัติคำขอของตนเอง
    if (req.requesterId === user.id) {
      throw new ForbiddenException('ไม่สามารถลงนามอนุมัติคำขอของตนเองได้ (หลักการ Separation of Duties)');
    }
    // Separation of Duties (SoD): ห้ามบุคคลเดิมลงนามซ้ำข้ามระดับในคำขอเดียวกัน
    if (req.signatures.some((s) => s.signerId === user.id && s.decision === 'approve')) {
      throw new ForbiddenException('คุณได้ลงนามอนุมัติคำขอนี้ในระดับก่อนหน้าไปแล้ว ไม่สามารถลงนามซ้ำในระดับนี้ได้ (Separation of Duties)');
    }

    if (body.decision !== 'approve' && body.decision !== 'reject') {
      throw new BadRequestException('ผลการพิจารณาไม่ถูกต้อง');
    }

    // ยืนยันตัวตน 2 ชั้น: 1) Verified Signing Session (Email OTP ผ่าน Resend) + 2) รหัส PIN 6 หลักประจำตัว
    if (check.expectedLevel === 'staff' || check.expectedLevel === 'l2' || check.expectedLevel === 'l1') {
      // 1. ตรวจสอบเซสชัน Email OTP
      const sessionToken = reqHttp.token;
      const verifiedSession = sessionToken
        ? await this.db.getSignVerifiedSession(user.id, sessionToken)
        : null;

      if (!verifiedSession || verifiedSession.expiresAt.getTime() < Date.now() || verifiedSession.revokedAt) {
        throw new UnauthorizedException(
          'กรุณายืนยันตัวตนด้วยรหัส OTP ทางอีเมลก่อนลงนามเอกสาร (เซสชันการลงนามยังไม่ได้รับการยืนยันหรือหมดอายุแล้ว)',
        );
      }

      // 2. ตรวจสอบรหัส PIN 6 หลัก
      if (!user.pin) throw new BadRequestException('กรุณาตั้งค่า PIN 6 หลักก่อนลงนาม');
      const key = `pin:${user.id}`;
      assertNotLocked(key);
      if (!(await verifySecret(user.pin, String(body.pin ?? '')))) {
        recordFailure(key);
        throw new UnauthorizedException('รหัส PIN ไม่ถูกต้อง');
      }
      clearFailures(key);
    }
    const finalSignature = requireDrawnSignature(body.signature, 'ผู้ลงนาม');
    const note = body.note ? String(body.note).slice(0, 1000) : undefined;

    const level: SignLevel = check.expectedLevel;

    const now = new Date().toISOString();
    req.signatures = req.signatures.filter((s) => s.level !== level);
    req.signatures.push({
      level,
      round: req.approvalRound || 1,
      signerId: user.id,
      signerName: user.name,
      title: user.position || ROLE_LABEL[user.role] || SIGN_LEVEL_TITLE[level],
      at: now,
      decision: body.decision,
      signature: finalSignature,
      note,
    });
    req.updatedAt = now;

    if (body.decision === 'reject') {
      req.status = 'rejected';
      req.rejectReason = note || 'ไม่ผ่านการพิจารณา';
      if (!this.notificationEvents) {
        this.db.notify(req.requesterId, `คำขอ ${req.code} ไม่ผ่าน`, req.rejectReason, `/requests/${req.id}`);
      }
    } else if (level === 'staff') {
      req.status = 'pending_l2';
      if (!this.notificationEvents) {
        this.db.notifyRole('APPROVER_L2', `รอเห็นชอบ ${req.code}`, req.requesterName, `/approver/sign/${req.id}`);
      }
    } else if (level === 'l2') {
      req.status = 'pending_l1';
      if (!this.notificationEvents) {
        this.db.notifyRole('APPROVER_L1', `รออนุมัติ ${req.code}`, req.requesterName, `/approver/sign/${req.id}`);
      }
    } else {
      req.status = req.type === 'borrow' ? 'borrowing' : 'approved';
      if (!this.notificationEvents) {
        this.db.notify(
          req.requesterId,
          `คำขอ ${req.code} อนุมัติแล้ว`,
          'ดาวน์โหลดเอกสารใบอนุญาต (PDF) ได้แล้ว',
          `/approver/permit/${req.id}`,
        );
      }
    }

    await this.db.persistRequest(req);
    if (this.notificationEvents) {
      await this.notificationEvents.onRequestSigned(req, level, body.decision, req.rejectReason);
    }
    await this.db.log('request', `${body.decision === 'approve' ? 'ลงนาม' : 'ไม่ผ่าน'} ${req.code}`, `${user.name} (${SIGN_LEVEL_TITLE[level]})`, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return this.enrich(req);
  }

  /** ขอเลื่อนวัน หรือ ยกเลิกคำขอ (เฉพาะเจ้าของคำขอ หรือ เจ้าหน้าที่ที่มีสิทธิ์ตรวจคำขอ) */
  @Post(':id/reschedule')
  async reschedule(@CurrentUser() user: Account, @Param('id') id: string, @Body() body: RescheduleDto) {
    return this.bookingMutex.runExclusive(async () => {
      const req = this.db.requests.find((r): r is BookingRequest => (r.id === id || r.code === id) && r.type === 'booking');
      if (!req) throw new NotFoundException('ไม่พบคำขอจอง');
      if (req.requesterId !== user.id && !hasPermission(user, 'review')) {
        throw new ForbiddenException('เฉพาะเจ้าของคำขอ หรือเจ้าหน้าที่ผู้รับผิดชอบเท่านั้นที่สามารถขอเลื่อนวันได้');
      }
      if (!['pending_staff', 'pending_l2', 'pending_l1', 'approved'].includes(req.status)) {
        throw new BadRequestException('คำขอนี้ไม่อยู่ในสถานะที่ขอเลื่อนวันได้');
      }
      const periods = Array.isArray(body.periods) ? body.periods : [];
      this.validatePeriodsAndVenues(req.venueIds, periods, req.id);

      // ตรวจสอบสต็อกอุปกรณ์เสริม (extraItems) สำหรับช่วงเวลาใหม่ด้วย
      if (req.extraItems && req.extraItems.length > 0) {
        const dates = periods.flatMap((p) => [p.start.slice(0, 10), p.end.slice(0, 10)]).sort();
        this.validateBorrowInventory(req.extraItems, dates[0], dates[dates.length - 1], req.id);
      }

      req.periods = periods.map((p) => ({ start: p.start, end: p.end }));
      req.status = 'pending_staff';
      // รอบการอนุมัติใหม่ (Immutable Audit Trail: รักษาประวัติลายเซ็นรอบเก่าไว้ใน DB)
      req.approvalRound = (req.approvalRound || 1) + 1;
      req.signatures = [];
      req.updatedAt = new Date().toISOString();
      await this.db.persistRequest(req);
      if (this.notificationEvents) {
        await this.notificationEvents.onBookingRescheduled(req);
      }
      await this.db.log('request', `ขอเลื่อนวัน ${req.code} (รอบที่ ${req.approvalRound})`, user.name, {
        id: user.id,
        name: user.name,
        role: user.role,
      });
      return this.enrich(req);
    });
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: Account, @Param('id') id: string, @Body() body: { reason?: string }) {
    const req = this.db.requests.find((r) => r.id === id || r.code === id);
    if (!req) throw new NotFoundException('ไม่พบคำขอ');
    if (req.requesterId !== user.id && !hasPermission(user, 'review')) {
      throw new ForbiddenException('เฉพาะเจ้าของคำขอ หรือเจ้าหน้าที่ผู้รับผิดชอบเท่านั้นที่สามารถยกเลิกคำขอได้');
    }
    if (['cancelled', 'rejected', 'returned', 'borrowing', 'repair_done'].includes(req.status)) {
      throw new BadRequestException('คำขอนี้ไม่อยู่ในสถานะที่ยกเลิกได้');
    }
    req.status = 'cancelled';
    req.rejectReason = body.reason ? String(body.reason).slice(0, 1000) : undefined;
    req.updatedAt = new Date().toISOString();
    await this.db.persistRequest(req);
    await this.db.log('request', `ยกเลิกคำขอ ${req.code}`, user.name, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return this.enrich(req);
  }

  /** ผู้ยืมแจ้งคืนอุปกรณ์ */
  @Post(':id/return-request')
  async requestReturn(@CurrentUser() user: Account, @Param('id') id: string) {
    const req = this.db.requests.find((r): r is BorrowRequest => (r.id === id || r.code === id) && r.type === 'borrow');
    if (!req) throw new NotFoundException('ไม่พบรายการยืม');
    if (req.requesterId !== user.id && !hasPermission(user, 'handover')) {
      throw new ForbiddenException('เฉพาะผู้ยืม หรือเจ้าหน้าที่รับมอบ–คืนอุปกรณ์เท่านั้นที่สามารถแจ้งคืนได้');
    }
    if (req.status !== 'borrowing') throw new BadRequestException('รายการนี้ไม่อยู่ในสถานะกำลังยืม');
    const now = new Date().toISOString();
    req.status = 'return_inspect';
    req.returnRequestedAt = now;
    req.updatedAt = now;
    await this.db.persistRequest(req);
    if (this.notificationEvents) {
      await this.notificationEvents.onBorrowReturnRequested(req);
    } else {
      this.db.notifyRole('STAFF', `แจ้งคืนอุปกรณ์ ${req.code}`, req.requesterName, `/staff/handover?id=${req.id}`);
    }
    return this.enrich(req);
  }

  /** เจ้าหน้าที่บันทึกเช็คลิสต์รับมอบ / รับคืน (ต้องมีลายเซ็นทั้งผู้รับมอบ/ผู้คืน และเจ้าหน้าที่) */
  @Permissions('handover')
  @Post(':id/handover')
  async handover(
    @CurrentUser() user: Account,
    @Param('id') id: string,
    @Body() body: HandoverDto,
  ) {
    const req = this.db.requests.find((r) => r.id === id || r.code === id);
    if (!req || req.type === 'repair') throw new NotFoundException('ไม่พบคำขอ');

    // Separation of Duties (SoD): เจ้าหน้าที่ไม่สามารถทำหน้าที่เป็นทั้งผู้ส่งมอบและผู้รับมอบสำหรับคำขอของตนเองได้
    if (req.requesterId === user.id) {
      throw new ForbiddenException('เจ้าหน้าที่ไม่สามารถเป็นทั้งผู้ส่งมอบและผู้รับมอบสำหรับคำขอของตนเองได้ (Separation of Duties)');
    }

    if (body.phase !== 'before' && body.phase !== 'after') throw new BadRequestException('ขั้นตอนไม่ถูกต้อง');
    const allowed =
      body.phase === 'before'
        ? ['approved', 'borrowing'].includes(req.status)
        : ['approved', 'borrowing', 'return_inspect'].includes(req.status);
    if (!allowed) throw new BadRequestException('คำขอนี้ยังไม่อนุมัติครบ หรือไม่อยู่ในสถานะรับมอบ/รับคืน');
    const citizenSig = requireDrawnSignature(body.citizenSignature, 'ผู้รับมอบ/ผู้ส่งคืน');
    const staffSig = requireDrawnSignature(body.staffSignature, 'เจ้าหน้าที่ผู้ตรวจสภาพ');
    const now = new Date().toISOString();
    const handoverRecord = {
      requestId: req.id,
      phase: body.phase,
      items: (Array.isArray(body.items) ? body.items : [])
        .slice(0, 50)
        .map((i) => ({ label: String(i?.label ?? '').slice(0, 200), ok: Boolean(i?.ok) })),
      note: String(body.note ?? '').slice(0, 1000),
      at: now,
      staffId: user.id,
      staffName: user.name,
      citizenSignature: citizenSig,
      staffSignature: staffSig,
    };
    this.db.handovers.push(handoverRecord);
    if (req.type === 'borrow') {
      req.status = body.phase === 'before' ? 'borrowing' : 'returned';
      if (body.phase === 'after') req.returnedAt = now;
    }
    req.updatedAt = now;
    await this.db.persistHandover(handoverRecord);
    await this.db.persistRequest(req);
    if (req.type === 'borrow' && body.phase === 'after' && this.notificationEvents) {
      await this.notificationEvents.onBorrowReturned(req);
    }
    await this.db.log('request', `${body.phase === 'before' ? 'ยืนยันรับมอบ' : 'ยืนยันรับคืน'} ${req.code}`, user.name, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return this.enrich(req);
  }

  /** อัปเดตสถานะงานซ่อม + ผู้แจ้งตรวจรับงาน (พร้อมลายเซ็นเจ้าหน้าที่และผู้แจ้งตรวจรับ) */
  @Post(':id/repair-status')
  async updateRepair(
    @CurrentUser() user: Account,
    @Param('id') id: string,
    @Body() body: RepairStatusDto,
  ) {
    const req = this.db.requests.find((r): r is RepairRequest => (r.id === id || r.code === id) && r.type === 'repair');
    if (!req) throw new NotFoundException('ไม่พบรายการแจ้งซ่อม');

    if (body.action === 'accept' || body.action === 'finish') {
      if (!hasPermission(user, 'review')) {
        throw new ForbiddenException('เฉพาะเจ้าหน้าที่ผู้รับผิดชอบเท่านั้นที่สามารถรับเรื่องหรือบันทึกซ่อมเสร็จได้');
      }
      // Security Policy: เจ้าหน้าที่ที่มี PIN ต้องยืนยัน PIN เสมอเมื่อรับเรื่องหรือบันทึกซ่อมเสร็จ
      if (user.pin) {
        if (!body.pin) {
          throw new BadRequestException('กรุณาระบุรหัส PIN 6 หลักเพื่อยืนยันการดำเนินการ');
        }
        const key = `pin:${user.id}`;
        assertNotLocked(key);
        if (!(await verifySecret(user.pin, String(body.pin)))) {
          recordFailure(key);
          throw new UnauthorizedException('รหัส PIN ไม่ถูกต้อง');
        }
        clearFailures(key);
      }
    } else if (body.action === 'confirm' || body.action === 'reopen') {
      // การตรวจรับงานต้องทำโดยผู้แจ้งซ่อมเท่านั้น (เจ้าหน้าที่ตรวจรับแทนไม่ได้)
      if (req.requesterId !== user.id) {
        throw new ForbiddenException('เฉพาะผู้แจ้งซ่อมเท่านั้นที่สามารถตรวจรับงานซ่อมได้');
      }
    } else {
      throw new BadRequestException('คำสั่งไม่ถูกต้อง');
    }

    const expected: Record<typeof body.action, RepairRequest['status'][]> = {
      accept: ['repair_submitted'],
      finish: ['repair_in_progress'],
      confirm: ['repair_awaiting_acceptance'],
      reopen: ['repair_awaiting_acceptance'],
    };
    if (!expected[body.action].includes(req.status)) {
      throw new BadRequestException('สถานะงานซ่อมไม่ถูกต้องสำหรับคำสั่งนี้');
    }

    const now = new Date().toISOString();
    if (body.action === 'accept') {
      req.status = 'repair_in_progress';
      req.acceptedAt = now;
      req.staffSignature = body.signature ? requireDrawnSignature(body.signature, 'เจ้าหน้าที่ผู้รับเรื่อง') : undefined;
      req.staffSignerName = user.name;
    } else if (body.action === 'finish') {
      const sig = body.signature ? requireDrawnSignature(body.signature, 'เจ้าหน้าที่ผู้ซ่อม') : undefined;
      req.status = 'repair_awaiting_acceptance';
      req.finishedAt = now;
      req.resolution = String(body.resolution ?? '').slice(0, 1000) || 'ดำเนินการซ่อมเรียบร้อย';
      req.staffSignature = sig;
      req.staffSignerName = user.name;
      if (!this.notificationEvents) {
        this.db.notify(req.requesterId, `${req.location} ซ่อมเสร็จแล้ว`, 'รอคุณตรวจรับงาน', `/repair?mode=track&id=${req.id}`);
      }
    } else if (body.action === 'confirm') {
      const sig = body.signature ? requireDrawnSignature(body.signature, 'ผู้แจ้งซ่อม') : undefined;
      req.status = 'repair_done';
      req.acceptanceSignature = sig;
      req.acceptedByRequesterAt = now;
    } else if (body.action === 'reopen') {
      req.status = 'repair_in_progress';
    }
    req.updatedAt = now;
    await this.db.persistRequest(req);
    if (this.notificationEvents) {
      await this.notificationEvents.onRepairStatusUpdated(req, body.action);
    }
    await this.db.log('request', `อัปเดตงานซ่อม ${req.code}`, user.name, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return this.enrich(req);
  }
}
