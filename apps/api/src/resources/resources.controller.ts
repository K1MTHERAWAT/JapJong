import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ACTIVE_BOOKING_STATUSES,
  Account,
  BookingRequest,
  ConflictInfo,
  DayAvailability,
  Equipment,
  EquipmentCategory,
  Period,
  Venue,
  VenueType,
  overlaps,
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
}
