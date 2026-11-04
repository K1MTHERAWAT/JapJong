import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import * as zlib from 'zlib';
import { DbService } from '../../db/db.service';
import { LineMessagingService } from '../messaging/line-messaging.service';
import {
  LineMessageTemplateService,
  TemplateOverride,
} from '../messaging/line-message-template.service';
import {
  CreateRichMenuDto,
  FlexTemplateUpsertDto,
  RichMenuActionDto,
  RichMenuType,
  UpdateRichMenuDto,
} from './rich-menu.dto';
import { LineRichMenuArea, LineRichMenuObject } from '../messaging/line-messaging.types';

export interface RichMenuRecord {
  id: string;
  name: string;
  menuType: RichMenuType;
  lineRichMenuId: string | null;
  chatBarText: string;
  width: number;
  height: number;
  imageData?: string | null;
  imageMimeType?: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  isDefault: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  actions: Array<{
    id: string;
    sortOrder: number;
    label: string;
    actionType: 'URI' | 'MESSAGE' | 'POSTBACK';
    actionData: string;
    area: { x: number; y: number; width: number; height: number };
  }>;
}

@Injectable()
export class LineRichMenuService implements OnModuleInit {
  private readonly logger = new Logger(LineRichMenuService.name);

  // Fallback in-memory cache
  private memoryMenus: RichMenuRecord[] = [];
  private memoryTemplates: Map<string, any> = new Map();

  constructor(
    private readonly db: DbService,
    private readonly lineMessagingService: LineMessagingService,
    private readonly templateService: LineMessageTemplateService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing LINE Rich Menu & Flex Message Service...');
    // เชื่อมต่อ Dynamic Template Override ให้กับ LineMessageTemplateService
    this.templateService.setOverrideResolver((event: string): TemplateOverride | null => {
      const tpl = this.memoryTemplates.get(event);
      if (!tpl) return null;
      return {
        status: tpl.status,
        templateType: tpl.templateType,
        headline: tpl.content?.headline,
        footerNote: tpl.content?.footerNote,
        headerColor: tpl.content?.headerColor,
        buttonLabel: tpl.content?.buttonLabel,
      };
    });

    try {
      await this.loadTemplatesFromDb();
      await this.seedDefaultMenus();
    } catch (err: any) {
      this.logger.warn(`Could not sync rich menus with DB on startup: ${err.message}`);
    }
  }

  // ==========================================
  // Image Generator & Validation Helpers
  // ==========================================

  /**
   * สร้างภาพ PNG ขนาด 2500x1686 พร้อมช่องตาราง 6 ช่องสำหรับ Rich Menu ด้วย Pure Node.js
   */
  generateDefaultRichMenuPng(
    title: string,
    tiles: Array<{ label: string; sub?: string }>,
    primaryColorHex: string = '#0F4C81',
  ): Buffer {
    const width = 2500;
    const height = 1686;

    // Parse primary hex
    const hex = primaryColorHex.replace('#', '');
    const pr = parseInt(hex.substring(0, 2), 16) || 15;
    const pg = parseInt(hex.substring(2, 4), 16) || 76;
    const pb = parseInt(hex.substring(4, 6), 16) || 129;

    const crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[i] = c;
    }
    const crc32 = (buf: Buffer): number => {
      let crc = -1;
      for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
      return (crc ^ -1) >>> 0;
    };
    const makeChunk = (type: string, data: Buffer): Buffer => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length, 0);
      const t = Buffer.from(type, 'ascii');
      const body = Buffer.concat([t, data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body), 0);
      return Buffer.concat([len, body, crc]);
    };

    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2; // RGB
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    // คำนวณ Scanlines: 2 rows x 3 columns
    // แถวบน y: 0 - 842, แถวล่าง y: 843 - 1685
    // เส้นแบ่งคอลัมน์ที่ x = 833, x = 1667, เส้นแบ่งแถวที่ y = 843
    const rowTop = Buffer.alloc(1 + width * 3);
    rowTop[0] = 0;
    const rowBottom = Buffer.alloc(1 + width * 3);
    rowBottom[0] = 0;
    const rowBorder = Buffer.alloc(1 + width * 3);
    rowBorder[0] = 0;

    for (let x = 0; x < width; x++) {
      const isColBorder = Math.abs(x - 833) <= 2 || Math.abs(x - 1667) <= 2;
      const colIdx = x < 833 ? 0 : x < 1667 ? 1 : 2;

      // Border row
      rowBorder[1 + x * 3] = 220;
      rowBorder[1 + x * 3 + 1] = 225;
      rowBorder[1 + x * 3 + 2] = 230;

      // Top row (สลับสีเล็กน้อย)
      if (isColBorder) {
        rowTop[1 + x * 3] = 210;
        rowTop[1 + x * 3 + 1] = 218;
        rowTop[1 + x * 3 + 2] = 228;
      } else {
        const shade = colIdx === 1 ? 8 : colIdx === 2 ? 16 : 0;
        rowTop[1 + x * 3] = Math.min(255, pr + shade);
        rowTop[1 + x * 3 + 1] = Math.min(255, pg + shade);
        rowTop[1 + x * 3 + 2] = Math.min(255, pb + shade);
      }

      // Bottom row (สีขาวสะอาด ตัดขอบเทาอ่อน)
      if (isColBorder) {
        rowBottom[1 + x * 3] = 220;
        rowBottom[1 + x * 3 + 1] = 226;
        rowBottom[1 + x * 3 + 2] = 235;
      } else {
        const alt = colIdx % 2 === 0 ? 255 : 250;
        rowBottom[1 + x * 3] = alt;
        rowBottom[1 + x * 3 + 1] = alt;
        rowBottom[1 + x * 3 + 2] = Math.min(255, alt + 2);
      }
    }

    const rows: Buffer[] = [];
    for (let y = 0; y < height; y++) {
      if (Math.abs(y - 843) <= 2 || y < 4 || y > height - 5) {
        rows.push(rowBorder);
      } else if (y < 843) {
        rows.push(rowTop);
      } else {
        rows.push(rowBottom);
      }
    }

    const rawData = Buffer.concat(rows);
    const compressed = zlib.deflateSync(rawData);

    return Buffer.concat([
      sig,
      makeChunk('IHDR', ihdr),
      makeChunk('IDAT', compressed),
      makeChunk('IEND', Buffer.alloc(0)),
    ]);
  }

  /**
   * ตรวจสอบขนาด มิติ และรูปแบบไฟล์ภาพตามมาตรฐาน LINE Messaging API
   */
  validateRichMenuImage(
    buffer: Buffer,
    mimeType: string,
  ): { valid: boolean; width: number; height: number; error?: string } {
    if (buffer.length > 1048576) {
      return {
        valid: false,
        width: 0,
        height: 0,
        error: `ขนาดไฟล์ (${(buffer.length / 1024 / 1024).toFixed(2)} MB) เกินขีดจำกัด 1 MB ของ LINE`,
      };
    }

    if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') {
      return {
        valid: false,
        width: 0,
        height: 0,
        error: `รูปแบบไฟล์ต้องเป็น image/jpeg หรือ image/png เท่านั้น (พบ ${mimeType})`,
      };
    }

    let width = 0;
    let height = 0;

    if (mimeType === 'image/png') {
      if (buffer.length < 24) return { valid: false, width: 0, height: 0, error: 'ข้อมูลไฟล์ PNG ไม่สมบูรณ์' };
      width = buffer.readUInt32BE(16);
      height = buffer.readUInt32BE(20);
    } else if (mimeType === 'image/jpeg') {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          height = buffer.readUInt16BE(offset + 5);
          width = buffer.readUInt16BE(offset + 7);
          break;
        }
        const len = buffer.readUInt16BE(offset + 2);
        offset += 2 + len;
      }
    }

    if (width < 800 || width > 2500) {
      return {
        valid: false,
        width,
        height,
        error: `ความกว้างต้องอยู่ระหว่าง 800 ถึง 2500 px (พบ ${width} px)`,
      };
    }

    if (height < 250) {
      return {
        valid: false,
        width,
        height,
        error: `ความสูงต้องไม่น้อยกว่า 250 px (พบ ${height} px)`,
      };
    }

    // LINE spec ratios: ~1.48:1 (2500:1686) or ~2.97:1 (2500:843)
    const ratio = width / height;
    const isRatio1 = Math.abs(ratio - 2500 / 1686) < 0.1;
    const isRatio2 = Math.abs(ratio - 2500 / 843) < 0.1;

    if (!isRatio1 && !isRatio2) {
      return {
        valid: false,
        width,
        height,
        error: `อัตราส่วนภาพไม่ถูกต้อง (${width}x${height}, ratio=${ratio.toFixed(2)}) ต้องเป็นอัตราส่วน 2500:1686 หรือ 2500:843 ตามมาตรฐาน LINE`,
      };
    }

    return { valid: true, width, height };
  }

  // ==========================================
  // Rich Menu Seed & Defaults
  // ==========================================

  async seedDefaultMenus(): Promise<void> {
    const existing = await this.listRichMenus();
    if (existing.length > 0) {
      this.logger.log(`Found ${existing.length} existing Rich Menus. Skipping default seed.`);
      return;
    }

    this.logger.log('Seeding default Rich Menus for JapJong (Citizen, Staff, Admin, Guest)...');

    // 1. Citizen Menu (เมนูประชาชน - 6 ช่อง)
    await this.createRichMenu({
      name: 'เมนูสำหรับประชาชน (Citizen)',
      menuType: 'CITIZEN',
      chatBarText: 'บริการประชาชน',
      width: 2500,
      height: 1686,
      isDefault: false,
      actions: [
        {
          label: 'จองสถานที่ราชการ',
          actionType: 'URI',
          actionData: '/booking',
          area: { x: 0, y: 0, width: 833, height: 843 },
          sortOrder: 1,
        },
        {
          label: 'ยืมอุปกรณ์',
          actionType: 'URI',
          actionData: '/borrow',
          area: { x: 833, y: 0, width: 834, height: 843 },
          sortOrder: 2,
        },
        {
          label: 'แจ้งปัญหา/ซ่อมบำรุง',
          actionType: 'URI',
          actionData: '/repair',
          area: { x: 1667, y: 0, width: 833, height: 843 },
          sortOrder: 3,
        },
        {
          label: 'ติดตามคำขอ',
          actionType: 'URI',
          actionData: '/requests',
          area: { x: 0, y: 843, width: 833, height: 843 },
          sortOrder: 4,
        },
        {
          label: 'เอกสารของฉัน',
          actionType: 'URI',
          actionData: '/documents',
          area: { x: 833, y: 843, width: 834, height: 843 },
          sortOrder: 5,
        },
        {
          label: 'ติดต่อเจ้าหน้าที่',
          actionType: 'MESSAGE',
          actionData: 'ติดต่อเจ้าหน้าที่ อบต.',
          area: { x: 1667, y: 843, width: 833, height: 843 },
          sortOrder: 6,
        },
      ],
    });

    // 2. Staff Menu (เมนูเจ้าหน้าที่ - 6 ช่อง)
    await this.createRichMenu({
      name: 'เมนูสำหรับเจ้าหน้าที่ (Staff)',
      menuType: 'STAFF',
      chatBarText: 'งานเจ้าหน้าที่',
      width: 2500,
      height: 1686,
      isDefault: false,
      actions: [
        {
          label: 'งานที่ต้องดำเนินการ',
          actionType: 'URI',
          actionData: '/staff',
          area: { x: 0, y: 0, width: 833, height: 843 },
          sortOrder: 1,
        },
        {
          label: 'ตรวจสอบคำขอ',
          actionType: 'URI',
          actionData: '/staff/reviews',
          area: { x: 833, y: 0, width: 834, height: 843 },
          sortOrder: 2,
        },
        {
          label: 'อนุมัติคำขอ',
          actionType: 'URI',
          actionData: '/staff/approvals',
          area: { x: 1667, y: 0, width: 833, height: 843 },
          sortOrder: 3,
        },
        {
          label: 'ลงนามเอกสาร',
          actionType: 'URI',
          actionData: '/staff/signatures',
          area: { x: 0, y: 843, width: 833, height: 843 },
          sortOrder: 4,
        },
        {
          label: 'แจ้งเตือนระบบ',
          actionType: 'URI',
          actionData: '/notifications',
          area: { x: 833, y: 843, width: 834, height: 843 },
          sortOrder: 5,
        },
        {
          label: 'หน้าหลักเจ้าหน้าที่',
          actionType: 'URI',
          actionData: '/dashboard',
          area: { x: 1667, y: 843, width: 833, height: 843 },
          sortOrder: 6,
        },
      ],
    });

    // 3. Admin Menu (เมนูผู้ดูแลระบบ - 6 ช่อง)
    await this.createRichMenu({
      name: 'เมนูสำหรับผู้ดูแลระบบ (Admin)',
      menuType: 'ADMIN',
      chatBarText: 'จัดการระบบ',
      width: 2500,
      height: 1686,
      isDefault: false,
      actions: [
        {
          label: 'Dashboard สรุปภาพรวม',
          actionType: 'URI',
          actionData: '/admin',
          area: { x: 0, y: 0, width: 833, height: 843 },
          sortOrder: 1,
        },
        {
          label: 'จัดการผู้ใช้งาน',
          actionType: 'URI',
          actionData: '/admin/users',
          area: { x: 833, y: 0, width: 834, height: 843 },
          sortOrder: 2,
        },
        {
          label: 'จัดการบริการและทรัพยากร',
          actionType: 'URI',
          actionData: '/admin/venues',
          area: { x: 1667, y: 0, width: 833, height: 843 },
          sortOrder: 3,
        },
        {
          label: 'จัดการ Rich Menu',
          actionType: 'URI',
          actionData: '/admin/line',
          area: { x: 0, y: 843, width: 833, height: 843 },
          sortOrder: 4,
        },
        {
          label: 'ประวัติการแจ้งเตือน',
          actionType: 'URI',
          actionData: '/admin/notifications',
          area: { x: 833, y: 843, width: 834, height: 843 },
          sortOrder: 5,
        },
        {
          label: 'ตั้งค่าระบบ',
          actionType: 'URI',
          actionData: '/admin/settings',
          area: { x: 1667, y: 843, width: 833, height: 843 },
          sortOrder: 6,
        },
      ],
    });

    // 4. Default / Guest Menu (เมนูทั่วไปสำหรับผู้ที่ยังไม่ได้ยืนยันตัวตน - Default Rich Menu)
    await this.createRichMenu({
      name: 'เมนูหลักเริ่มต้น (Default / Guest)',
      menuType: 'DEFAULT',
      chatBarText: 'เมนูจับจอง',
      width: 2500,
      height: 1686,
      isDefault: true,
      actions: [
        {
          label: 'เข้าสู่ระบบ / เชื่อมต่อบัญชี',
          actionType: 'URI',
          actionData: '/login',
          area: { x: 0, y: 0, width: 833, height: 843 },
          sortOrder: 1,
        },
        {
          label: 'จองสถานที่',
          actionType: 'URI',
          actionData: '/booking',
          area: { x: 833, y: 0, width: 834, height: 843 },
          sortOrder: 2,
        },
        {
          label: 'ยืมอุปกรณ์',
          actionType: 'URI',
          actionData: '/borrow',
          area: { x: 1667, y: 0, width: 833, height: 843 },
          sortOrder: 3,
        },
        {
          label: 'แจ้งซ่อมบำรุง',
          actionType: 'URI',
          actionData: '/repair',
          area: { x: 0, y: 843, width: 833, height: 843 },
          sortOrder: 4,
        },
        {
          label: 'วิธีการใช้งานระบบ',
          actionType: 'MESSAGE',
          actionData: 'วิธีใช้งานระบบจับจอง',
          area: { x: 833, y: 843, width: 834, height: 843 },
          sortOrder: 5,
        },
        {
          label: 'ติดต่อ อบต.',
          actionType: 'MESSAGE',
          actionData: 'ติดต่อ อบต. น้ำชำ',
          area: { x: 1667, y: 843, width: 833, height: 843 },
          sortOrder: 6,
        },
      ],
    });

    this.logger.log('Default Rich Menus created successfully.');
  }

  // ==========================================
  // CRUD Operations
  // ==========================================

  async listRichMenus(): Promise<RichMenuRecord[]> {
    try {
      const records = (await this.db.prisma.$queryRawUnsafe(
        `SELECT m.*, 
          COALESCE(
            json_agg(
              json_build_object(
                'id', a.id,
                'sortOrder', a.sort_order,
                'label', a.label,
                'actionType', a.action_type,
                'actionData', a.action_data,
                'area', a.area
              ) ORDER BY a.sort_order ASC
            ) FILTER (WHERE a.id IS NOT NULL), '[]'
          ) as actions
        FROM "rich_menus" m
        LEFT JOIN "rich_menu_actions" a ON m.id = a.rich_menu_id
        GROUP BY m.id
        ORDER BY m.created_at DESC`
      )) as any[];

      if (Array.isArray(records) && records.length > 0) {
        return records.map((r) => ({
          id: r.id,
          name: r.name,
          menuType: r.menu_type,
          lineRichMenuId: r.line_rich_menu_id,
          chatBarText: r.chat_bar_text,
          width: r.width,
          height: r.height,
          imageData: r.image_data,
          imageMimeType: r.image_mime_type,
          status: r.status,
          isDefault: !!r.is_default,
          publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
          actions: typeof r.actions === 'string' ? JSON.parse(r.actions) : r.actions,
        }));
      }
    } catch (err: any) {
      this.logger.warn(`Could not query rich menus from PostgreSQL: ${err.message}`);
    }

    return this.memoryMenus;
  }

  async getRichMenu(id: string): Promise<RichMenuRecord> {
    const list = await this.listRichMenus();
    const menu = list.find((m) => m.id === id);
    if (!menu) throw new NotFoundException(`Rich Menu ${id} not found`);
    return menu;
  }

  async createRichMenu(dto: CreateRichMenuDto): Promise<RichMenuRecord> {
    this.validateActions(dto.actions, dto.width || 2500, dto.height || 1686);

    const id = `rm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    // สร้าง Default Placeholder Image
    const placeholderPng = this.generateDefaultRichMenuPng(
      dto.name,
      dto.actions.map((a) => ({ label: a.label })),
      dto.menuType === 'ADMIN' ? '#B91C1C' : dto.menuType === 'STAFF' ? '#0F766E' : '#0F4C81',
    );
    const base64Image = placeholderPng.toString('base64');

    const record: RichMenuRecord = {
      id,
      name: dto.name,
      menuType: dto.menuType,
      lineRichMenuId: null,
      chatBarText: dto.chatBarText,
      width: dto.width || 2500,
      height: dto.height || 1686,
      imageData: base64Image,
      imageMimeType: 'image/png',
      status: 'DRAFT',
      isDefault: !!dto.isDefault,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      actions: dto.actions.map((a, idx) => ({
        id: `rma-${id}-${idx + 1}`,
        sortOrder: a.sortOrder ?? idx + 1,
        label: a.label,
        actionType: a.actionType,
        actionData: a.actionData,
        area: a.area,
      })),
    };

    try {
      if (dto.isDefault) {
        await this.db.prisma.$executeRawUnsafe(`UPDATE "rich_menus" SET "is_default" = false`);
      }

      await this.db.prisma.$executeRawUnsafe(
        `INSERT INTO "rich_menus" (
          "id", "name", "menu_type", "chat_bar_text", "width", "height", 
          "image_data", "image_mime_type", "status", "is_default", "created_at", "updated_at"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        record.id,
        record.name,
        record.menuType,
        record.chatBarText,
        record.width,
        record.height,
        record.imageData,
        record.imageMimeType,
        record.status,
        record.isDefault,
      );

      for (const act of record.actions) {
        await this.db.prisma.$executeRawUnsafe(
          `INSERT INTO "rich_menu_actions" (
            "id", "rich_menu_id", "sort_order", "label", "action_type", "action_data", "area", "created_at", "updated_at"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          act.id,
          record.id,
          act.sortOrder,
          act.label,
          act.actionType,
          act.actionData,
          JSON.stringify(act.area),
        );
      }
    } catch (err: any) {
      this.logger.warn(`Failed to persist rich menu to Postgres, saving in memory: ${err.message}`);
    }

    if (dto.isDefault) {
      this.memoryMenus.forEach((m) => (m.isDefault = false));
    }
    this.memoryMenus.unshift(record);

    return record;
  }

  async updateRichMenu(id: string, dto: UpdateRichMenuDto): Promise<RichMenuRecord> {
    const existing = await this.getRichMenu(id);
    const now = new Date().toISOString();

    if (dto.actions) {
      this.validateActions(dto.actions, existing.width, existing.height);
    }

    const updated: RichMenuRecord = {
      ...existing,
      name: dto.name ?? existing.name,
      menuType: dto.menuType ?? existing.menuType,
      chatBarText: dto.chatBarText ?? existing.chatBarText,
      isDefault: dto.isDefault !== undefined ? dto.isDefault : existing.isDefault,
      updatedAt: now,
      actions: dto.actions
        ? dto.actions.map((a, idx) => ({
            id: `rma-${id}-${idx + 1}`,
            sortOrder: a.sortOrder ?? idx + 1,
            label: a.label,
            actionType: a.actionType,
            actionData: a.actionData,
            area: a.area,
          }))
        : existing.actions,
    };

    try {
      if (dto.isDefault) {
        await this.db.prisma.$executeRawUnsafe(`UPDATE "rich_menus" SET "is_default" = false`);
      }

      await this.db.prisma.$executeRawUnsafe(
        `UPDATE "rich_menus" SET 
          "name" = $1, "menu_type" = $2, "chat_bar_text" = $3, 
          "is_default" = $4, "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = $5`,
        updated.name,
        updated.menuType,
        updated.chatBarText,
        updated.isDefault,
        id,
      );

      if (dto.actions) {
        await this.db.prisma.$executeRawUnsafe(`DELETE FROM "rich_menu_actions" WHERE "rich_menu_id" = $1`, id);
        for (const act of updated.actions) {
          await this.db.prisma.$executeRawUnsafe(
            `INSERT INTO "rich_menu_actions" (
              "id", "rich_menu_id", "sort_order", "label", "action_type", "action_data", "area", "created_at", "updated_at"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            act.id,
            id,
            act.sortOrder,
            act.label,
            act.actionType,
            act.actionData,
            JSON.stringify(act.area),
          );
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to update rich menu in Postgres: ${err.message}`);
    }

    const memIdx = this.memoryMenus.findIndex((m) => m.id === id);
    if (memIdx >= 0) {
      if (dto.isDefault) this.memoryMenus.forEach((m) => (m.isDefault = false));
      this.memoryMenus[memIdx] = updated;
    }

    return updated;
  }

  async deleteRichMenu(id: string): Promise<{ success: boolean }> {
    const existing = await this.getRichMenu(id);

    // หากเคย Publish ใน LINE แล้ว ให้ลบจาก LINE ด้วย
    if (existing.lineRichMenuId) {
      await this.lineMessagingService.deleteRichMenu(existing.lineRichMenuId);
    }

    try {
      await this.db.prisma.$executeRawUnsafe(`DELETE FROM "rich_menus" WHERE "id" = $1`, id);
    } catch (err: any) {
      this.logger.warn(`Failed to delete rich menu from Postgres: ${err.message}`);
    }

    this.memoryMenus = this.memoryMenus.filter((m) => m.id !== id);
    return { success: true };
  }

  async uploadRichMenuImage(
    id: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<{ success: boolean; width: number; height: number }> {
    const existing = await this.getRichMenu(id);
    const check = this.validateRichMenuImage(fileBuffer, mimeType);
    if (!check.valid) {
      throw new BadRequestException(check.error);
    }

    const base64 = fileBuffer.toString('base64');

    try {
      await this.db.prisma.$executeRawUnsafe(
        `UPDATE "rich_menus" SET "image_data" = $1, "image_mime_type" = $2, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = $3`,
        base64,
        mimeType,
        id,
      );
    } catch (err: any) {
      this.logger.warn(`Failed to save image in Postgres: ${err.message}`);
    }

    existing.imageData = base64;
    existing.imageMimeType = mimeType;

    // หาก Menu เผยแพร่อยู่บน LINE แล้ว ให้อัปโหลดภาพขึ้น LINE ทันที
    if (existing.lineRichMenuId) {
      await this.lineMessagingService.uploadRichMenuImage(
        existing.lineRichMenuId,
        fileBuffer,
        mimeType as 'image/jpeg' | 'image/png',
      );
    }

    return { success: true, width: check.width, height: check.height };
  }

  // ==========================================
  // Publish & LINE Synchronization
  // ==========================================

  async publishRichMenu(id: string): Promise<RichMenuRecord> {
    const menu = await this.getRichMenu(id);
    if (!menu.actions || menu.actions.length === 0) {
      throw new BadRequestException('Rich Menu ต้องมีอย่างน้อย 1 Action Area ก่อน Publish');
    }

    // แปลง Actions ให้อยู่ในรูปแบบ LINE Messaging API
    const lineAreas: LineRichMenuArea[] = menu.actions.map((a) => {
      let actionObj: any;
      if (a.actionType === 'URI') {
        const safeUrl = this.templateService.buildSafeUrl(a.actionData);
        actionObj = { type: 'uri', label: a.label, uri: safeUrl };
      } else if (a.actionType === 'MESSAGE') {
        actionObj = { type: 'message', label: a.label, text: a.actionData };
      } else {
        actionObj = {
          type: 'postback',
          label: a.label,
          data: a.actionData.slice(0, 300),
          displayText: a.label,
        };
      }
      return {
        bounds: a.area,
        action: actionObj,
      };
    });

    const richMenuObject: LineRichMenuObject = {
      size: { width: menu.width, height: menu.height },
      selected: false,
      name: menu.name.slice(0, 300),
      chatBarText: menu.chatBarText.slice(0, 14),
      areas: lineAreas,
    };

    // 1. สร้าง Rich Menu ใน LINE Messaging API
    const createRes = await this.lineMessagingService.createRichMenu(richMenuObject);
    if (!createRes.ok || !createRes.data?.richMenuId) {
      throw new BadRequestException(`ไม่สามารถสร้าง Rich Menu บน LINE ได้: ${createRes.errorMessage || 'Unknown error'}`);
    }

    const lineRichMenuId = createRes.data.richMenuId;

    // 2. อัปโหลดภาพไปยัง LINE
    let imgBuffer: Buffer;
    let mimeType = menu.imageMimeType || 'image/png';
    if (menu.imageData) {
      imgBuffer = Buffer.from(menu.imageData, 'base64');
    } else {
      imgBuffer = this.generateDefaultRichMenuPng(
        menu.name,
        menu.actions.map((a) => ({ label: a.label })),
        menu.menuType === 'ADMIN' ? '#B91C1C' : menu.menuType === 'STAFF' ? '#0F766E' : '#0F4C81',
      );
      mimeType = 'image/png';
    }

    await this.lineMessagingService.uploadRichMenuImage(
      lineRichMenuId,
      imgBuffer,
      mimeType as 'image/jpeg' | 'image/png',
    );

    // 3. หากตั้งให้เป็น Default ให้ตั้งเป็น Default ทันที
    if (menu.isDefault) {
      await this.lineMessagingService.setDefaultRichMenu(lineRichMenuId);
    }

    // 4. บันทึกข้อมูลลงฐานข้อมูล
    const now = new Date().toISOString();
    menu.lineRichMenuId = lineRichMenuId;
    menu.status = 'PUBLISHED';
    menu.publishedAt = now;

    try {
      await this.db.prisma.$executeRawUnsafe(
        `UPDATE "rich_menus" SET 
          "line_rich_menu_id" = $1, "status" = 'PUBLISHED', "published_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = $2`,
        lineRichMenuId,
        id,
      );
    } catch (err: any) {
      this.logger.warn(`Failed to update published status in Postgres: ${err.message}`);
    }

    return menu;
  }

  async setDefaultRichMenu(id: string): Promise<RichMenuRecord> {
    const menu = await this.getRichMenu(id);
    if (!menu.lineRichMenuId) {
      // หากยังไม่ได้ Publish ให้ Publish ก่อน
      await this.publishRichMenu(id);
    }

    const updated = await this.getRichMenu(id);
    if (updated.lineRichMenuId) {
      await this.lineMessagingService.setDefaultRichMenu(updated.lineRichMenuId);
    }

    try {
      await this.db.prisma.$executeRawUnsafe(`UPDATE "rich_menus" SET "is_default" = false`);
      await this.db.prisma.$executeRawUnsafe(`UPDATE "rich_menus" SET "is_default" = true WHERE "id" = $1`, id);
    } catch (err: any) {
      this.logger.warn(`Failed to update is_default in Postgres: ${err.message}`);
    }

    this.memoryMenus.forEach((m) => (m.isDefault = m.id === id));
    updated.isDefault = true;
    return updated;
  }

  async linkRichMenuToUser(lineUserId: string, richMenuId: string): Promise<{ success: boolean }> {
    const menu = await this.getRichMenu(richMenuId);
    if (!menu.lineRichMenuId) {
      throw new BadRequestException('Rich Menu นี้ยังไม่ได้ถูก Publish บน LINE');
    }

    const res = await this.lineMessagingService.linkRichMenuToUser(lineUserId, menu.lineRichMenuId);
    if (!res.ok) {
      throw new BadRequestException(res.errorMessage || 'Failed to link rich menu to user');
    }
    return { success: true };
  }

  async unlinkRichMenuFromUser(lineUserId: string): Promise<{ success: boolean }> {
    const res = await this.lineMessagingService.unlinkRichMenuFromUser(lineUserId);
    if (!res.ok) {
      throw new BadRequestException(res.errorMessage || 'Failed to unlink rich menu');
    }
    return { success: true };
  }

  // ==========================================
  // Role-Based Rich Menu Switching (Security Strict)
  // ==========================================

  /**
   * สลับ Rich Menu ตาม Role ของผู้ใช้งานที่ผูกกับ JapJong Account ใน Database เท่านั้น
   * ห้ามเชื่อถือข้อมูล Role จาก Client หรือ LINE Profile เด็ดขาด
   */
  async switchUserRichMenuByRole(
    lineUserId: string,
    role?: string,
  ): Promise<{ switched: boolean; menuType: RichMenuType; richMenuId?: string }> {
    if (!lineUserId) return { switched: false, menuType: 'DEFAULT' };

    // กำหนด Target Menu Type ตาม Role ที่บันทึกไว้ใน DB
    let targetType: RichMenuType = 'CITIZEN';
    if (!role) {
      targetType = 'DEFAULT';
    } else if (role === 'ADMIN') {
      targetType = 'ADMIN';
    } else if (role === 'STAFF' || role === 'APPROVER_L1' || role === 'APPROVER_L2') {
      targetType = 'STAFF';
    } else {
      targetType = 'CITIZEN';
    }

    const allMenus = await this.listRichMenus();
    // หา Menu ที่ตรงกับ Role และมีสถานะ PUBLISHED
    const matched = allMenus.find((m) => m.menuType === targetType && m.lineRichMenuId && m.status === 'PUBLISHED');

    if (matched && matched.lineRichMenuId) {
      await this.lineMessagingService.linkRichMenuToUser(lineUserId, matched.lineRichMenuId);
      this.logger.log(
        `Switched rich menu for LINE user ${lineUserId.slice(0, 6)}... to ${targetType} (Menu ID: ${matched.id})`,
      );
      return { switched: true, menuType: targetType, richMenuId: matched.id };
    }

    // หากไม่มีเมนูเฉพาะ หรือเป็น guest/unverified ให้ Unlink เพื่อกลับไปใช้ Default Menu ของ LINE OA
    await this.lineMessagingService.unlinkRichMenuFromUser(lineUserId);
    return { switched: true, menuType: targetType };
  }

  // ==========================================
  // Flex Message Templates Management
  // ==========================================

  private async loadTemplatesFromDb() {
    try {
      const records = (await this.db.prisma.$queryRawUnsafe(
        `SELECT * FROM "flex_message_templates" ORDER BY "created_at" ASC`
      )) as any[];
      if (Array.isArray(records)) {
        for (const r of records) {
          this.memoryTemplates.set(r.event_type, {
            id: r.id,
            name: r.name,
            eventType: r.event_type,
            templateType: r.template_type,
            content: typeof r.content === 'string' ? JSON.parse(r.content) : r.content,
            status: r.status,
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not load flex templates from Postgres: ${err.message}`);
    }
  }

  async listFlexTemplates() {
    await this.loadTemplatesFromDb();
    return Array.from(this.memoryTemplates.values());
  }

  async upsertFlexTemplate(dto: FlexTemplateUpsertDto) {
    const id = `flx-${dto.eventType.toLowerCase().replace(/_/g, '-')}`;
    const record = {
      id,
      name: dto.name,
      eventType: dto.eventType,
      templateType: dto.templateType || 'FLEX',
      content: dto.content,
      status: dto.status || 'ACTIVE',
    };

    try {
      await this.db.prisma.$executeRawUnsafe(
        `INSERT INTO "flex_message_templates" ("id", "name", "event_type", "template_type", "content", "status", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT ("event_type") DO UPDATE SET
          "name" = EXCLUDED."name",
          "template_type" = EXCLUDED."template_type",
          "content" = EXCLUDED."content",
          "status" = EXCLUDED."status",
          "updated_at" = CURRENT_TIMESTAMP`,
        record.id,
        record.name,
        record.eventType,
        record.templateType,
        JSON.stringify(record.content),
        record.status,
      );
    } catch (err: any) {
      this.logger.warn(`Failed to upsert flex template in Postgres: ${err.message}`);
    }

    this.memoryTemplates.set(dto.eventType, record);
    return record;
  }

  previewFlexTemplate(eventType: string, sampleData?: any) {
    return this.templateService.buildNotification({
      event: eventType as any,
      recipientRole: eventType.startsWith('STAFF_') ? 'STAFF' : 'CITIZEN',
      requestCode: sampleData?.requestCode || 'BK-20261104-001',
      venueName: sampleData?.venueName || 'ห้องประชุมสภาเทศบาล (ชั้น 2)',
      equipmentSummary: sampleData?.equipmentSummary || 'ไมโครโฟนไร้สาย 2 ตัว, โปรเจกเตอร์ 1 เครื่อง',
      location: sampleData?.location || 'อาคารสำนักงานเทศบาล',
      dateText: sampleData?.dateText || '10 พฤศจิกายน 2569 เวลา 09:00 - 12:00 น.',
      requesterName: sampleData?.requesterName || 'นายสมชาย ประชาชนสุข',
      reason: sampleData?.reason || 'เอกสารประกอบไม่ครบถ้วนตามเกณฑ์',
      linkPath: sampleData?.linkPath || '/requests/BK-20261104-001',
      useFlex: true,
    });
  }

  // ==========================================
  // Validation Helpers
  // ==========================================

  private validateActions(actions: RichMenuActionDto[], totalW: number, totalH: number) {
    if (!actions || actions.length === 0) {
      throw new BadRequestException('Rich Menu ต้องมีอย่างน้อย 1 Action Area');
    }
    if (actions.length > 20) {
      throw new BadRequestException('Rich Menu สามารถมี Action ได้สูงสุดไม่เกิน 20 ช่อง');
    }

    for (let i = 0; i < actions.length; i++) {
      const act = actions[i];
      const { x, y, width, height } = act.area;

      if (x < 0 || y < 0 || width <= 0 || height <= 0) {
        throw new BadRequestException(`Action ที่ ${i + 1} (${act.label}): พิกัดพื้นที่ bounds ไม่ถูกต้อง`);
      }

      if (x + width > totalW || y + height > totalH) {
        throw new BadRequestException(
          `Action ที่ ${i + 1} (${act.label}): ขอบเขตพิกัดเกินขนาดภาพ (${x + width}x${y + height} > ${totalW}x${totalH})`,
        );
      }

      // Security check on action data
      if (act.actionType === 'URI') {
        const url = act.actionData.trim();
        // Allow relative path (for LIFF target) or valid HTTP/HTTPS URL
        if (!url.startsWith('/') && !url.startsWith('http://') && !url.startsWith('https://')) {
          throw new BadRequestException(`Action ที่ ${i + 1}: URI ต้องขึ้นต้นด้วย / หรือ http/https เท่านั้น`);
        }
        if (url.includes('token=') || url.includes('secret=')) {
          throw new BadRequestException(`Action ที่ ${i + 1}: ห้ามใส่ Token หรือ Secret ลงใน Rich Menu URL`);
        }
      }
    }
  }
}
