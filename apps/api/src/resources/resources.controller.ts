import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ACTIVE_BOOKING_STATUSES,
  Account,
  BookingRequest,
  BorrowRequest,
  ConflictInfo,
  DayAvailability,
  Equipment,
  EquipmentCategory,
  Period,
  Venue,
  VenueType,
  getThaiDistricts,
  getThaiProvinces,
  getThaiSubdistricts,
  overlaps,
  validateThaiAddressHierarchy,
} from '@japjong/shared';
import { CurrentUser, Permissions, Public } from '../auth/auth.guard';
import { DbService } from '../db/db.service';

const VALID_VENUE_TYPES: VenueType[] = ['meeting', 'pavilion', 'field', 'yard', 'training'];
const VALID_EQUIPMENT_CATEGORIES: EquipmentCategory[] = ['audio', 'tent', 'it'];

@ApiTags('Resources')
@Controller('resources')
export class ResourcesController {
  constructor(private readonly db: DbService) {}

  @Public()
  @Get('venues')
  listVenues() {
    return this.db.venues;
  }

  @Public()
  @Get('equipment')
  listEquipment() {
    return this.db.equipment;
  }

  @Permissions('manageResources')
  @Post('venues')
  async createVenue(@CurrentUser() user: Account, @Body() body: Partial<Venue>) {
    if (!body.name?.trim()) throw new BadRequestException('กรุณาระบุชื่อสถานที่');
    const capacity = Math.max(1, Math.min(10000, Math.floor(Number(body.capacity ?? 50))));
    const advanceDays = Math.max(0, Math.min(365, Math.floor(Number(body.advanceDays ?? 3))));
    const venue: Venue = {
      id: await this.db.nextId('v'),
      name: body.name.trim().slice(0, 120),
      type: body.type && VALID_VENUE_TYPES.includes(body.type) ? body.type : 'meeting',
      building: (body.building ?? 'อาคารสำนักงาน').trim().slice(0, 120),
      floor: (body.floor ?? 'ชั้น 1').trim().slice(0, 60),
      capacity: Number.isFinite(capacity) ? capacity : 50,
      status: body.enabled === false ? 'maintenance' : 'available',
      enabled: body.enabled ?? true,
      facilities: Array.isArray(body.facilities)
        ? body.facilities.map((f) => String(f).trim()).filter(Boolean).slice(0, 20)
        : ['เครื่องปรับอากาศ'],
      openTime: /^\d{2}:\d{2}$/.test(body.openTime ?? '') ? body.openTime! : '08:00',
      closeTime: /^\d{2}:\d{2}$/.test(body.closeTime ?? '') ? body.closeTime! : '17:00',
      openDays: Array.isArray(body.openDays)
        ? body.openDays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        : [1, 2, 3, 4, 5],
      advanceDays: Number.isFinite(advanceDays) ? advanceDays : 3,
      formName: (body.formName ?? 'แบบคำขอใช้สถานที่').trim().slice(0, 120),
      approvalLevels: 3,
      images: Array.isArray(body.images)
        ? body.images.map((img) => String(img).trim()).filter(Boolean).slice(0, 3)
        : [],
    };
    this.db.venues.push(venue);
    await this.db.persistVenue(venue);
    await this.db.log('resource', `เพิ่มสถานที่ ${venue.name}`, `${venue.capacity} คน`, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return venue;
  }

  @Permissions('manageResources')
  @Patch('venues/:id')
  async updateVenue(@CurrentUser() user: Account, @Param('id') id: string, @Body() body: Partial<Venue>) {
    const venue = this.db.venues.find((v) => v.id === id);
    if (!venue) throw new NotFoundException('ไม่พบสถานที่');
    if (typeof body.name === 'string' && body.name.trim()) venue.name = body.name.trim().slice(0, 120);
    if (body.type && VALID_VENUE_TYPES.includes(body.type)) venue.type = body.type;
    if (typeof body.building === 'string') venue.building = body.building.trim().slice(0, 120);
    if (typeof body.floor === 'string') venue.floor = body.floor.trim().slice(0, 60);
    if (body.capacity !== undefined) {
      const cap = Math.floor(Number(body.capacity));
      if (!Number.isFinite(cap) || cap < 1 || cap > 10000) {
        throw new BadRequestException('ความจุสถานที่ต้องอยู่ระหว่าง 1 ถึง 10,000 คน');
      }
      venue.capacity = cap;
    }
    if (body.advanceDays !== undefined) {
      const adv = Math.floor(Number(body.advanceDays));
      if (!Number.isFinite(adv) || adv < 0 || adv > 365) {
        throw new BadRequestException('จำนวนวันจองล่วงหน้าต้องอยู่ระหว่าง 0 ถึง 365 วัน');
      }
      venue.advanceDays = adv;
    }
    if (typeof body.openTime === 'string' && /^\d{2}:\d{2}$/.test(body.openTime)) venue.openTime = body.openTime;
    if (typeof body.closeTime === 'string' && /^\d{2}:\d{2}$/.test(body.closeTime)) venue.closeTime = body.closeTime;
    if (Array.isArray(body.facilities)) {
      venue.facilities = body.facilities.map((f) => String(f).trim()).filter(Boolean).slice(0, 20);
    }
    if (Array.isArray(body.images)) {
      venue.images = body.images.map((img) => String(img).trim()).filter(Boolean).slice(0, 3);
    }
    if (typeof body.enabled === 'boolean') {
      venue.enabled = body.enabled;
      venue.status = body.enabled ? 'available' : 'maintenance';
      await this.db.log('resource', `${body.enabled ? 'เปิด' : 'ปิด'}ให้จอง ${venue.name}`, venue.status, {
        id: user.id,
        name: user.name,
        role: user.role,
      });
    }
    await this.db.persistVenue(venue);
    return venue;
  }

  @Permissions('manageResources')
  @Delete('venues/:id')
  async deleteVenue(@CurrentUser() user: Account, @Param('id') id: string) {
    const venue = this.db.venues.find((v) => v.id === id);
    if (!venue) throw new NotFoundException('ไม่พบสถานที่');
    await this.db.deleteVenue(id);
    await this.db.log('resource', `ลบสถานที่ ${venue.name}`, id, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return { ok: true, id };
  }

  @Permissions('manageResources')
  @Post('equipment')
  async createEquipment(@CurrentUser() user: Account, @Body() body: Partial<Equipment>) {
    if (!body.name?.trim()) throw new BadRequestException('กรุณาระบุชื่ออุปกรณ์');
    const stock = Math.floor(Number(body.stock ?? 1));
    if (!Number.isFinite(stock) || stock < 0 || stock > 10000) {
      throw new BadRequestException('จำนวนอุปกรณ์คงคลังต้องอยู่ระหว่าง 0 ถึง 10,000');
    }
    const eq: Equipment = {
      id: await this.db.nextId('e'),
      name: body.name.trim().slice(0, 120),
      category:
        body.category && VALID_EQUIPMENT_CATEGORIES.includes(body.category)
          ? body.category
          : 'audio',
      stock,
      enabled: body.enabled ?? true,
      images: Array.isArray(body.images)
        ? body.images.map((img) => String(img).trim()).filter(Boolean).slice(0, 3)
        : [],
    };
    this.db.equipment.push(eq);
    await this.db.persistEquipment(eq);
    await this.db.log('resource', `เพิ่มอุปกรณ์ ${eq.name}`, `คงเหลือ ${eq.stock}`, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return eq;
  }

  @Permissions('manageResources')
  @Patch('equipment/:id')
  async updateEquipment(@Param('id') id: string, @Body() body: Partial<Equipment>) {
    const eq = this.db.equipment.find((e) => e.id === id);
    if (!eq) throw new NotFoundException('ไม่พบอุปกรณ์');
    if (typeof body.name === 'string' && body.name.trim()) eq.name = body.name.trim().slice(0, 120);
    if (body.category && VALID_EQUIPMENT_CATEGORIES.includes(body.category)) {
      eq.category = body.category;
    }
    if (body.stock !== undefined) {
      const stock = Math.floor(Number(body.stock));
      if (!Number.isFinite(stock) || stock < 0 || stock > 10000) {
        throw new BadRequestException('จำนวนอุปกรณ์คงคลังต้องอยู่ระหว่าง 0 ถึง 10,000');
      }
      eq.stock = stock;
    }
    if (typeof body.enabled === 'boolean') eq.enabled = body.enabled;
    if (Array.isArray(body.images)) {
      eq.images = body.images.map((img) => String(img).trim()).filter(Boolean).slice(0, 3);
    }
    await this.db.persistEquipment(eq);
    return eq;
  }

  @Permissions('manageResources')
  @Delete('equipment/:id')
  async deleteEquipment(@CurrentUser() user: Account, @Param('id') id: string) {
    const eq = this.db.equipment.find((e) => e.id === id);
    if (!eq) throw new NotFoundException('ไม่พบอุปกรณ์');
    await this.db.deleteEquipment(id);
    await this.db.log('resource', `ลบอุปกรณ์ ${eq.name}`, id, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    return { ok: true, id };
  }

  /** ปฏิทินความว่างรายเดือนของสถานที่ */
  @Public()
  @SkipThrottle()
  @Get('availability')
  availability(@Query('venueIds') venueIdsParam = '', @Query('month') month?: string): DayAvailability[] {
    const targetMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
    const venueIds = venueIdsParam.split(',').filter(Boolean);
    const [y, m] = targetMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const bookings = this.db.requests.filter(
      (r): r is BookingRequest =>
        r.type === 'booking' &&
        ACTIVE_BOOKING_STATUSES.includes(r.status) &&
        (venueIds.length === 0 || r.venueIds.some((id) => venueIds.includes(id))),
    );

    const out: DayAvailability[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${targetMonth}-${String(d).padStart(2, '0')}`;
      const dayStart = new Date(`${dateStr}T00:00:00+07:00`);
      const dayEnd = new Date(`${dateStr}T23:59:59+07:00`);
      let bookedHours = 0;
      for (const b of bookings) {
        for (const p of b.periods) {
          if (overlaps(p, { start: dayStart.toISOString(), end: dayEnd.toISOString() })) {
            const s = Math.max(new Date(p.start).getTime(), dayStart.getTime());
            const e = Math.min(new Date(p.end).getTime(), dayEnd.getTime());
            bookedHours += Math.max(1, (e - s) / 3600000);
          }
        }
      }
      const level: DayAvailability['level'] =
        bookedHours >= 7 ? 'full' : bookedHours >= 3 ? 'few' : 'many';
      out.push({ date: dateStr, level, bookedHours });
    }
    return out;
  }

  /** ตรวจสอบช่วงเวลาซ้อนทับ */
  @Public()
  @SkipThrottle()
  @Post('check-conflicts')
  checkConflicts(@Body() body: { venueIds: string[]; periods: Period[]; excludeRequestId?: string }): {
    conflicts: ConflictInfo[];
  } {
    const conflicts: ConflictInfo[] = [];
    const active = this.db.requests.filter(
      (r): r is BookingRequest =>
        r.type === 'booking' &&
        ACTIVE_BOOKING_STATUSES.includes(r.status) &&
        r.id !== body.excludeRequestId &&
        r.venueIds.some((v) => body.venueIds.includes(v)),
    );
    body.periods.forEach((p, periodIndex) => {
      for (const b of active) {
        for (const bp of b.periods) {
          if (overlaps(p, bp)) {
            const venueId = b.venueIds.find((v) => body.venueIds.includes(v)) ?? b.venueIds[0];
            const venueName = this.db.venues.find((v) => v.id === venueId)?.name ?? venueId;
            conflicts.push({
              periodIndex,
              venueId,
              venueName,
              start: bp.start,
              end: bp.end,
              code: b.code,
            });
          }
        }
      }
    });
    return { conflicts };
  }

  /** ตรวจสอบความพร้อมใช้งานและจำนวนติดจองของอุปกรณ์ (รองรับทั้งยืมอุปกรณ์และการใช้อุปกรณ์เสริมในสถานที่) */
  @Public()
  @SkipThrottle()
  @Post('check-equipment-availability')
  checkEquipmentAvailability(
    @Body()
    body: {
      items: { equipmentId: string; qty: number }[];
      pickupDate?: string;
      returnDate?: string;
      periods?: { start: string; end: string }[];
      month?: string;
      excludeRequestId?: string;
    },
  ) {
    const items = Array.isArray(body.items) ? body.items : [];
    let pickupDate = String(body.pickupDate || '').slice(0, 10);
    let returnDate = String(body.returnDate || '').slice(0, 10);

    if ((!pickupDate || !returnDate) && body.periods && body.periods.length > 0) {
      const starts = body.periods.map((p) => p.start.slice(0, 10)).filter(Boolean).sort();
      const ends = body.periods.map((p) => p.end.slice(0, 10)).filter(Boolean).sort();
      if (starts.length > 0) pickupDate = starts[0];
      if (ends.length > 0) returnDate = ends[ends.length - 1];
    }

    const targetMonth =
      body.month && /^\d{4}-\d{2}$/.test(body.month)
        ? body.month
        : pickupDate
        ? pickupDate.slice(0, 7)
        : new Date().toISOString().slice(0, 7);

    const [y, m] = targetMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();

    // กรองเฉพาะคำขอจริงจากฐานข้อมูล (ไม่นำ mock/demo requests มารบกวนสต๊อกจริง)
    const isRealRequest = (r: { id: string }) =>
      !(r as any).isDemo &&
      !r.id.startsWith('r-br-00') &&
      !r.id.startsWith('r-bk-01') &&
      !r.id.startsWith('r-rp-00');

    const activeBorrows = this.db.requests.filter(
      (r): r is BorrowRequest =>
        r.type === 'borrow' &&
        isRealRequest(r) &&
        ['pending_staff', 'pending_l2', 'pending_l1', 'approved', 'borrowing', 'return_inspect'].includes(r.status) &&
        r.id !== body.excludeRequestId,
    );

    const activeBookingsWithItems = this.db.requests.filter(
      (r): r is BookingRequest =>
        r.type === 'booking' &&
        isRealRequest(r) &&
        ACTIVE_BOOKING_STATUSES.includes(r.status) &&
        r.id !== body.excludeRequestId &&
        Boolean(r.extraItems && r.extraItems.length > 0),
    );

    // คำนวณรายวันสำหรับปฏิทิน
    const dayAvailability: {
      date: string;
      level: 'many' | 'few' | 'full';
      isConflict: boolean;
      bookedHours?: number;
      details: {
        equipmentId: string;
        name: string;
        requestedQty: number;
        reservedQty: number;
        availableQty: number;
        totalStock: number;
      }[];
    }[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${targetMonth}-${String(d).padStart(2, '0')}`;
      let hasShortage = false;
      let totalReservedCount = 0;
      let totalStockCount = 0;

      const details = items.map((item) => {
        const eq = this.db.equipment.find((e) => e.id === item.equipmentId);
        const name = eq?.name || item.equipmentId;
        const totalStock = eq?.stock || 0;

        const reservedBorrows = activeBorrows
          .filter((b) => b.pickupDate <= dateStr && b.returnDate >= dateStr)
          .reduce((sum, b) => {
            const found = b.items.find((i) => i.equipmentId === item.equipmentId);
            return sum + (found ? found.qty : 0);
          }, 0);

        const reservedBookings = activeBookingsWithItems
          .filter((b) =>
            b.periods.some((p) => p.start.slice(0, 10) <= dateStr && p.end.slice(0, 10) >= dateStr),
          )
          .reduce((sum, b) => {
            const found = b.extraItems.find((i) => i.equipmentId === item.equipmentId);
            return sum + (found ? found.qty : 0);
          }, 0);

        const reservedQty = reservedBorrows + reservedBookings;
        const availableQty = Math.max(0, totalStock - reservedQty);
        if (item.qty > availableQty) {
          hasShortage = true;
        }
        totalReservedCount += reservedQty;
        totalStockCount += totalStock;

        return {
          equipmentId: item.equipmentId,
          name,
          requestedQty: item.qty,
          reservedQty,
          availableQty,
          totalStock,
        };
      });

      const level: 'many' | 'few' | 'full' =
        hasShortage || (totalStockCount > 0 && totalReservedCount >= totalStockCount)
          ? 'full'
          : totalReservedCount > 0
          ? 'few'
          : 'many';

      dayAvailability.push({
        date: dateStr,
        level,
        isConflict: hasShortage,
        details,
      });
    }

    // คำนวณสรุปเฉพาะช่วงวันที่ขอใช้ (pickupDate ถึง returnDate)
    const summary = items.map((item) => {
      const eq = this.db.equipment.find((e) => e.id === item.equipmentId);
      const name = eq?.name || item.equipmentId;
      const totalStock = eq?.stock || 0;

      let maxReservedInPeriod = 0;
      let minAvailableInPeriod = totalStock;

      if (pickupDate && returnDate && pickupDate <= returnDate) {
        const sTime = new Date(pickupDate).getTime();
        const eTime = new Date(returnDate).getTime();
        for (let t = sTime; t <= eTime; t += 86400000) {
          const dStr = new Date(t).toISOString().slice(0, 10);
          const reservedBorrows = activeBorrows
            .filter((b) => b.pickupDate <= dStr && b.returnDate >= dStr)
            .reduce((sum, b) => {
              const found = b.items.find((i) => i.equipmentId === item.equipmentId);
              return sum + (found ? found.qty : 0);
            }, 0);

          const reservedBookings = activeBookingsWithItems
            .filter((b) =>
              b.periods.some((p) => p.start.slice(0, 10) <= dStr && p.end.slice(0, 10) >= dStr),
            )
            .reduce((sum, b) => {
              const found = b.extraItems.find((i) => i.equipmentId === item.equipmentId);
              return sum + (found ? found.qty : 0);
            }, 0);

          const curReserved = reservedBorrows + reservedBookings;
          const curAvailable = Math.max(0, totalStock - curReserved);
          if (curReserved > maxReservedInPeriod) maxReservedInPeriod = curReserved;
          if (curAvailable < minAvailableInPeriod) minAvailableInPeriod = curAvailable;
        }
      }

      const isShortage = item.qty > minAvailableInPeriod;

      return {
        equipmentId: item.equipmentId,
        name,
        requestedQty: item.qty,
        maxReservedInPeriod,
        minAvailableInPeriod,
        totalStock,
        isShortage,
      };
    });

    const isAvailable = !summary.some((s) => s.isShortage);

    return {
      isAvailable,
      dayAvailability,
      summary,
    };
  }

  // ===================== Thai Administrative Divisions (Province -> District -> Subdistrict) =====================

  @Public()
  @SkipThrottle()
  @Get('thai-address/provinces')
  listThaiProvinces(@Query('q') q?: string) {
    const provinces = getThaiProvinces();
    if (!q?.trim()) return provinces;
    const kw = q.trim().toLowerCase();
    return provinces.filter((p) => p.nameTh.toLowerCase().includes(kw) || p.id === kw);
  }

  @Public()
  @SkipThrottle()
  @Get('thai-address/districts')
  listThaiDistricts(@Query('province') province?: string, @Query('q') q?: string) {
    const districts = getThaiDistricts(province);
    if (!q?.trim()) return districts;
    const kw = q.trim().toLowerCase();
    return districts.filter((d) => d.nameTh.toLowerCase().includes(kw) || d.id === kw);
  }

  @Public()
  @SkipThrottle()
  @Get('thai-address/subdistricts')
  listThaiSubdistricts(
    @Query('province') province?: string,
    @Query('district') district?: string,
    @Query('q') q?: string,
  ) {
    const subdistricts = getThaiSubdistricts(province, district);
    if (!q?.trim()) return subdistricts;
    const kw = q.trim().toLowerCase();
    return subdistricts.filter(
      (s) => s.nameTh.toLowerCase().includes(kw) || s.zipCode.includes(kw) || s.id === kw,
    );
  }

  @Public()
  @SkipThrottle()
  @Post('thai-address/validate')
  validateThaiAddress(
    @Body()
    body: {
      province?: string;
      district?: string;
      subdistrict?: string;
      provinceId?: string;
      districtId?: string;
      subdistrictId?: string;
    },
  ) {
    return validateThaiAddressHierarchy(body || {});
  }
}
