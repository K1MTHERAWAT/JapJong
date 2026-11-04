import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/auth.guard';
import { LineRichMenuService } from '../line/rich-menu/line-rich-menu.service';
import {
  CreateRichMenuDto,
  FlexTemplateUpsertDto,
  LinkRichMenuUserDto,
  UnlinkRichMenuUserDto,
  UpdateRichMenuDto,
  UploadRichMenuImageDto,
} from '../line/rich-menu/rich-menu.dto';

@ApiTags('Admin / LINE Integration')
@ApiBearerAuth('bearer')
@Controller('admin/line')
export class LineAdminController {
  constructor(private readonly richMenuService: LineRichMenuService) {}

  @Permissions('manageUsers')
  @Get('rich-menus')
  @ApiOperation({ summary: 'รายการ Rich Menus ทั้งหมดในระบบ' })
  async listRichMenus() {
    return this.richMenuService.listRichMenus();
  }

  @Permissions('manageUsers')
  @Get('rich-menus/:id')
  @ApiOperation({ summary: 'ดูรายละเอียด Rich Menu ตาม ID' })
  async getRichMenu(@Param('id') id: string) {
    return this.richMenuService.getRichMenu(id);
  }

  @Permissions('manageUsers')
  @Post('rich-menus')
  @ApiOperation({ summary: 'สร้าง Rich Menu ใหม่' })
  async createRichMenu(@Body() dto: CreateRichMenuDto) {
    return this.richMenuService.createRichMenu(dto);
  }

  @Permissions('manageUsers')
  @Patch('rich-menus/:id')
  @ApiOperation({ summary: 'แก้ไข Rich Menu' })
  async updateRichMenu(@Param('id') id: string, @Body() dto: UpdateRichMenuDto) {
    return this.richMenuService.updateRichMenu(id, dto);
  }

  @Permissions('manageUsers')
  @Delete('rich-menus/:id')
  @ApiOperation({ summary: 'ลบ Rich Menu (ทั้งจากระบบและ LINE Messaging API)' })
  async deleteRichMenu(@Param('id') id: string) {
    return this.richMenuService.deleteRichMenu(id);
  }

  @Permissions('manageUsers')
  @Post('rich-menus/init-defaults')
  @ApiOperation({ summary: 'สร้างชุดเมนูเริ่มต้น (Citizen, Staff, Admin, Guest)' })
  async initDefaults() {
    await this.richMenuService.seedDefaultMenus();
    return { success: true, message: 'Default Rich Menus initialized successfully' };
  }

  @Permissions('manageUsers')
  @Post('rich-menus/:id/publish')
  @ApiOperation({ summary: 'เผยแพร่ Rich Menu ขึ้น LINE Messaging API' })
  async publishRichMenu(@Param('id') id: string) {
    return this.richMenuService.publishRichMenu(id);
  }

  @Permissions('manageUsers')
  @Post('rich-menus/:id/set-default')
  @ApiOperation({ summary: 'กำหนด Rich Menu เป็น Default สำหรับผู้ใช้ทั่วไป' })
  async setDefaultRichMenu(@Param('id') id: string) {
    return this.richMenuService.setDefaultRichMenu(id);
  }

  @Permissions('manageUsers')
  @Post('rich-menus/:id/upload-image')
  @ApiOperation({ summary: 'อัปโหลดภาพสำหรับ Rich Menu (Base64 JPEG/PNG)' })
  async uploadImage(@Param('id') id: string, @Body() dto: UploadRichMenuImageDto) {
    if (!dto.imageData) throw new BadRequestException('imageData is required');
    const cleanBase64 = dto.imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    return this.richMenuService.uploadRichMenuImage(id, buffer, dto.mimeType);
  }

  @Permissions('manageUsers')
  @Post('rich-menus/link-user')
  @ApiOperation({ summary: 'ผูก Rich Menu เข้ากับ LINE User ID ที่ระบุ' })
  async linkUser(@Body() dto: LinkRichMenuUserDto) {
    return this.richMenuService.linkRichMenuToUser(dto.lineUserId, dto.richMenuId);
  }

  @Permissions('manageUsers')
  @Post('rich-menus/unlink-user')
  @ApiOperation({ summary: 'ยกเลิกการผูก Rich Menu ของผู้ใช้ (กลับไปใช้ Default)' })
  async unlinkUser(@Body() dto: UnlinkRichMenuUserDto) {
    return this.richMenuService.unlinkRichMenuFromUser(dto.lineUserId);
  }

  @Permissions('manageUsers')
  @Post('rich-menus/switch-user-role')
  @ApiOperation({ summary: 'ทดสอบการสลับ Rich Menu ตาม Role ของผู้ใช้' })
  async switchUserRole(@Body() body: { lineUserId: string; role?: string }) {
    return this.richMenuService.switchUserRichMenuByRole(body.lineUserId, body.role);
  }

  @Permissions('manageUsers')
  @Get('flex-templates')
  @ApiOperation({ summary: 'รายการ Flex Message Templates ทั้งหมด' })
  async listFlexTemplates() {
    return this.richMenuService.listFlexTemplates();
  }

  @Permissions('manageUsers')
  @Post('flex-templates')
  @ApiOperation({ summary: 'บันทึกหรือปรับแต่ง Flex Message Template' })
  async upsertFlexTemplate(@Body() dto: FlexTemplateUpsertDto) {
    return this.richMenuService.upsertFlexTemplate(dto);
  }

  @Permissions('manageUsers')
  @Post('flex-templates/preview')
  @ApiOperation({ summary: 'Preview เนื้อหา Flex Card สำหรับ Event ที่เลือก' })
  async previewFlexTemplate(@Body() body: { eventType: string; sampleData?: any }) {
    if (!body.eventType) throw new BadRequestException('eventType is required');
    return this.richMenuService.previewFlexTemplate(body.eventType, body.sampleData);
  }
}

