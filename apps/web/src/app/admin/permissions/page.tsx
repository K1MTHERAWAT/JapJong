'use client'; // กำหนดให้คอมโพเนนต์นี้ทำงานในฝั่ง Client (React Client Component)

// นำเข้า React Hooks พื้นฐานสำหรับจัดการ State, Effects, Memoization และ Callbacks
import React, { useCallback, useEffect, useMemo, useState } from 'react';
// นำเข้า Type นิยามประเภทข้อมูลบทบาทและสิทธิ์จากแพ็กเกจกลาง shared
import {
  CreateRoleDto,
  PublicAccount,
  Role,
  RoleItem,
  Tone,
  UpdateRoleDto,
} from '@japjong/shared';
// นำเข้า Auth Context เพื่อตรวจสอบบัญชีของผู้ดูแลระบบปัจจุบัน และรีเฟรชสิทธิ์
import { useAuth } from '@/components/auth-context';
// นำเข้า AppShell โครงสร้างเลย์เอาต์หลักของแอปพลิเคชัน
import { AppShell } from '@/components/shell';
// นำเข้า Icon แสดงรูปไอคอน SVG
import { Icon } from '@/components/icons';
// นำเข้าคอมโพเนนต์ UI พื้นฐาน: Chip (ป้ายกำกับ), Tabs (สลับแท็บ), Toggle (สวิตช์เปิด/ปิด)
import { Chip, Tabs, Toggle } from '@/components/ui';
// นำเข้า API client SDK กลางสำหรับเรียก Backend REST API
import { api } from '@/lib/api';

// กำหนดประเภทชื่อแท็บหลัก: 'roles' (จัดการบทบาท) หรือ 'assignment' (กำหนดบทบาทให้ผู้ใช้งาน)
type MainTab = 'roles' | 'assignment';

// รายการโทนสีป้ายบทบาท (Badge Tone) พร้อมชื่อภาษาไทยและ Class สำหรับแสดงตัวอย่างสี
const AVAILABLE_TONES: { tone: Tone; label: string; colorClass: string }[] = [
  { tone: 'green', label: 'เขียว', colorClass: 'bg-emerald-500' },
  { tone: 'blue', label: 'น้ำเงิน', colorClass: 'bg-blue-500' },
  { tone: 'amber', label: 'ส้มเหลือง', colorClass: 'bg-amber-500' },
  { tone: 'purple', label: 'ม่วง', colorClass: 'bg-purple-500' },
  { tone: 'teal', label: 'ฟ้าเขียว', colorClass: 'bg-teal-500' },
  { tone: 'red', label: 'แดง', colorClass: 'bg-rose-500' },
  { tone: 'gray', label: 'เทา', colorClass: 'bg-slate-500' },
  { tone: 'orange', label: 'ส้ม', colorClass: 'bg-orange-500' },
];

/**
 * หน้าจอจัดการบทบาทและสิทธิ์ผู้ใช้งาน (RBAC Management Page)
 * สำหรับผู้ดูแลระบบ เพื่อสร้าง แก้ไข ปิด/เปิด บทบาทในระบบ และกำหนดบทบาทให้ผู้ใช้งานแบบรายคนหรือแบบกลุ่ม
 */
export default function AdminPermissionsPage() {
  // ดึงข้อมูลบัญชีผู้ใช้ปัจจุบันที่ล็อกอินอยู่ และฟังก์ชันรีเฟรชข้อมูลโปรไฟล์
  const { account: currentAccount, refreshMe } = useAuth();
  // State แท็บหลักที่กำลังเลือกแสดงผลอยู่ (ค่าเริ่มต้น: จัดการบทบาท)
  const [mainTab, setMainTab] = useState<MainTab>('roles');

  // --- Roles State: ข้อมูลบทบาทและการจัดการ Modal บทบาท ---
  const [roles, setRoles] = useState<RoleItem[]>([]); // รายการบทบาททั้งหมดในระบบ
  const [rolesLoading, setRolesLoading] = useState(true); // สถานะกำลังโหลดบทบาท
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null); // บทบาทที่กำลังแก้ไข (ถ้าเป็น null คือสร้างใหม่)
  const [isAddRoleModalOpen, setIsAddRoleModalOpen] = useState(false); // ควบคุมการเปิด/ปิด Modal บทบาท
  const [roleFormKey, setRoleFormKey] = useState(''); // รหัสบทบาท (Role Code ตัวพิมพ์ใหญ่)
  const [roleFormName, setRoleFormName] = useState(''); // ชื่อบทบาทภาษาไทย
  const [roleFormDesc, setRoleFormDesc] = useState(''); // คำอธิบายขอบเขตหน้าที่ของบทบาท
  const [roleFormTone, setRoleFormTone] = useState<Tone>('blue'); // โทนสีป้ายบทบาท
  const [roleFormEnabled, setRoleFormEnabled] = useState(true); // สถานะเปิด/ปิดใช้งานบทบาท
  const [roleModalError, setRoleModalError] = useState(''); // ข้อความเตือนข้อผิดพลาดใน Modal
  const [roleModalSaving, setRoleModalSaving] = useState(false); // สถานะกำลังบันทึกข้อมูลบทบาท
  const [deletingRole, setDeletingRole] = useState<RoleItem | null>(null); // บทบาทที่ถูกเลือกเพื่อขอยืนยันการลบ

  // --- Users State: ข้อมูลผู้ใช้งานและการกำหนดบทบาท ---
  const [users, setUsers] = useState<PublicAccount[]>([]); // รายชื่อผู้ใช้งานทั้งหมด
  const [usersLoading, setUsersLoading] = useState(true); // สถานะกำลังโหลดรายชื่อผู้ใช้
  const [userSearch, setUserSearch] = useState(''); // ข้อความค้นหาผู้ใช้งาน (ชื่อ, เบอร์, สังกัด)
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all'); // ตัวกรองบทบาทผู้ใช้
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]); // รายการ ID ผู้ใช้ที่ถูกเลือกสำหรับ Bulk Assign
  const [bulkTargetRole, setBulkTargetRole] = useState<string>(''); // บทบาทเป้าหมายสำหรับการเปลี่ยนพร้อมกันเป็นกลุ่ม
  const [isBulkAssigning, setIsBulkAssigning] = useState(false); // สถานะกำลังส่งคำขอกำหนดบทบาทแบบกลุ่ม

  // --- Feedback Notification State: แสดงข้อความแจ้งเตือนผลการทำงาน ---
  const [successMsg, setSuccessMsg] = useState(''); // ข้อความแจ้งเตือนสำเร็จ
  const [errorMsg, setErrorMsg] = useState(''); // ข้อความแจ้งเตือนข้อผิดพลาด

  /**
   * ฟังก์ชันแสดงข้อความสำเร็จแบบตั้งเวลาซ่อนอัตโนมัติ (4 วินาที)
   */
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg('');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  /**
   * ฟังก์ชันแสดงข้อความแจ้งเตือนข้อผิดพลาด (5 วินาที)
   */
  const showError = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg('');
    setTimeout(() => setErrorMsg(''), 5000);
  };

  /**
   * ฟังก์ชันดึงรายการบทบาททั้งหมดจาก Backend API
   */
  const loadRoles = useCallback(async () => {
    try {
      setRolesLoading(true);
      const list = await api.getRoles();
      setRoles(list);
    } catch (err: any) {
      showError(err.message || 'ไม่สามารถโหลดรายการบทบาทได้');
    } finally {
      setRolesLoading(false);
    }
  }, []);

  /**
   * ฟังก์ชันดึงรายชื่อผู้ใช้งานทั้งหมดจาก Backend API
   */
  const loadUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      const list = await api.users();
      setUsers(list);
    } catch (err: any) {
      showError(err.message || 'ไม่สามารถโหลดรายชื่อผู้ใช้งานได้');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // ดึงข้อมูลบทบาทและรายชื่อผู้ใช้งานเมื่อเปิดหน้าจอครั้งแรก
  useEffect(() => {
    loadRoles();
    loadUsers();
  }, [loadRoles, loadUsers]);

  /**
   * ฟังก์ชันส่ง Custom Event แจ้งเตือนเมนู Sidebar ให้รีเฟรชสิทธิ์ตามบทบาทที่เปลี่ยนแปลง
   */
  const notifyNavigationChange = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('japjong-navigation-refresh'));
    }
    refreshMe();
  };

  /**
   * ฟังก์ชันเปิด Modal สำหรับสร้างบทบาทใหม่ (เคลียร์ค่าฟอร์มเป็นค่าเริ่มต้น)
   */
  const openAddModal = () => {
    setEditingRole(null);
    setRoleFormKey('');
    setRoleFormName('');
    setRoleFormDesc('');
    setRoleFormTone('blue');
    setRoleFormEnabled(true);
    setRoleModalError('');
    setIsAddRoleModalOpen(true);
  };

  /**
   * ฟังก์ชันเปิด Modal เพื่อแก้ไขข้อมูลบทบาทเดิมที่มีอยู่
   * @param role - บทบาทที่ต้องการแก้ไข
   */
  const openEditModal = (role: RoleItem) => {
    setEditingRole(role);
    setRoleFormKey(role.key);
    setRoleFormName(role.name);
    setRoleFormDesc(role.description || '');
    setRoleFormTone(role.tone || 'blue');
    setRoleFormEnabled(role.enabled);
    setRoleModalError('');
    setIsAddRoleModalOpen(true);
  };

  /**
   * ฟังก์ชันบันทึกข้อมูลบทบาท (รองรับทั้งการสร้างใหม่และการอัปเดตบทบาทเดิม)
   */
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    // ตรวจสอบความถูกต้องของชื่อบทบาท
    if (!roleFormName.trim()) {
      setRoleModalError('กรุณากรอกชื่อบทบาท');
      return;
    }

    try {
      setRoleModalSaving(true);
      setRoleModalError('');

      if (editingRole) {
        // อัปเดตข้อมูลบทบาทเดิม
        const dto: UpdateRoleDto = {
          name: roleFormName.trim(),
          description: roleFormDesc.trim(),
          tone: roleFormTone,
          enabled: roleFormEnabled,
        };
        await api.updateRole(editingRole.id, dto);
        showSuccess(`แก้ไขข้อมูลบทบาท "${roleFormName.trim()}" สำเร็จ`);
      } else {
        // สร้างบทบาทใหม่
        const dto: CreateRoleDto = {
          key: roleFormKey.trim() ? roleFormKey.trim().toUpperCase() : undefined,
          name: roleFormName.trim(),
          description: roleFormDesc.trim(),
          tone: roleFormTone,
          enabled: roleFormEnabled,
        };
        await api.createRole(dto);
        showSuccess(`เพิ่มบทบาทใหม่ "${roleFormName.trim()}" สำเร็จ`);
      }

      setIsAddRoleModalOpen(false); // ปิด Modal
      await loadRoles(); // โหลดข้อมูลบทบาทใหม่
      notifyNavigationChange(); // รีเฟรชเมนู Sidebar
    } catch (err: any) {
      setRoleModalError(err.message || 'บันทึกบทบาทไม่สำเร็จ');
    } finally {
      setRoleModalSaving(false);
    }
  };

  /**
   * ฟังก์ชันสลับสถานะเปิด/ปิดการใช้งานบทบาท
   * @param role - บทบาทที่ต้องการเปลี่ยนสถานะ
   */
  const handleToggleRole = async (role: RoleItem) => {
    // ป้องกันการปิดการใช้งานบทบาทผู้ดูแลระบบ (ADMIN)
    if (role.key === 'ADMIN') {
      showError('ไม่สามารถปิดการใช้งานบทบาทผู้ดูแลระบบ (ADMIN) ได้');
      return;
    }
    try {
      await api.toggleRole(role.id);
      showSuccess(`${role.enabled ? 'ปิด' : 'เปิด'}การใช้งานบทบาท "${role.name}" แล้ว`);
      await loadRoles();
      notifyNavigationChange();
    } catch (err: any) {
      showError(err.message || 'ไม่สามารถเปลี่ยนสถานะบทบาทได้');
    }
  };

  /**
   * ฟังก์ชันลบบทบาทออกจากระบบถาวร (เฉพาะบทบาทที่สร้างขึ้นเองและไม่มีผู้ใช้ผูกอยู่)
   */
  const handleDeleteRole = async () => {
    if (!deletingRole) return;
    try {
      await api.deleteRole(deletingRole.id);
      showSuccess(`ลบบทบาท "${deletingRole.name}" ออกจากระบบแล้ว`);
      setDeletingRole(null);
      await loadRoles();
      notifyNavigationChange();
    } catch (err: any) {
      showError(err.message || 'ไม่สามารถลบบทบาทได้');
    }
  };

  /**
   * ฟังก์ชันเปลี่ยนบทบาทให้ผู้ใช้งานแบบรายบุคคล
   * @param user - ข้อมูลผู้ใช้งานเป้าหมาย
   * @param newRole - บทบาทใหม่ที่ต้องการมอบหมาย
   */
  const handleAssignSingleUserRole = async (user: PublicAccount, newRole: Role) => {
    if (user.role === newRole) return; // หากเป็นบทบาทเดิมอยู่แล้ว ไม่ต้องทำอะไร
    // ป้องกัน Admin ลดระดับบทบาทของตนเองเพื่อไม่ให้ล็อคระบบ
    if (user.id === currentAccount?.id && currentAccount?.role === 'ADMIN' && newRole !== 'ADMIN') {
      showError('ไม่สามารถลดระดับบทบาทของตนเองได้');
      return;
    }

    try {
      await api.updatePermissions(user.id, { role: newRole });
      showSuccess(`เปลี่ยนบทบาทของ ${user.name} เป็น ${newRole} สำเร็จ`);
      await loadUsers();
      await loadRoles();
      notifyNavigationChange();
    } catch (err: any) {
      showError(err.message || 'ไม่สามารถเปลี่ยนบทบาทได้');
    }
  };

  /**
   * ฟังก์ชันเปิด/ระงับการใช้งานบัญชีผู้ใช้
   * @param user - ข้อมูลผู้ใช้งาน
   */
  const handleToggleUserActive = async (user: PublicAccount) => {
    // ป้องกันการระงับบัญชีของตนเอง
    if (user.id === currentAccount?.id) {
      showError('ไม่สามารถระงับการใช้งานบัญชีของตนเองได้');
      return;
    }
    const nextActive = user.active === false;
    try {
      await api.updatePermissions(user.id, { active: nextActive });
      showSuccess(`${nextActive ? 'เปิด' : 'ระงับ'}การใช้งานบัญชี ${user.name} แล้ว`);
      await loadUsers();
    } catch (err: any) {
      showError(err.message || 'ไม่สามารถเปลี่ยนสถานะบัญชีได้');
    }
  };

  /**
   * ฟังก์ชันเปลี่ยนบทบาทผู้ใช้แบบกลุ่ม (Bulk Role Assignment)
   */
  const handleBulkAssign = async () => {
    // ตรวจสอบว่าเลือกผู้ใช้อย่างน้อย 1 คนหรือไม่
    if (selectedUserIds.length === 0) {
      showError('กรุณาเลือกผู้ใช้งานที่ต้องการเปลี่ยนบทบาทอย่างน้อย 1 คน');
      return;
    }
    // ตรวจสอบว่าเลือกบทบาทเป้าหมายหรือไม่
    if (!bulkTargetRole) {
      showError('กรุณาเลือกบทบาทเป้าหมายที่ต้องการกำหนด');
      return;
    }

    try {
      setIsBulkAssigning(true);
      const res = await api.bulkAssignRole(selectedUserIds, bulkTargetRole as Role);
      if (res.errors && res.errors.length > 0) {
        showError(`เปลี่ยนบทบาทสำเร็จ ${res.updatedCount} คน (มีข้อผิดพลาด: ${res.errors.join(', ')})`);
      } else {
        showSuccess(`เปลี่ยนบทบาทให้ผู้ใช้งาน ${res.updatedCount} คนเป็น "${bulkTargetRole}" เรียบร้อยแล้ว`);
      }
      setSelectedUserIds([]); // ล้างรายการเลือก
      setBulkTargetRole(''); // ล้างค่าบทบาทเป้าหมาย
      await loadUsers();
      await loadRoles();
      notifyNavigationChange();
    } catch (err: any) {
      showError(err.message || 'ไม่สามารถกำหนดบทบาทกลุ่มได้');
    } finally {
      setIsBulkAssigning(false);
    }
  };

  /**
   * ฟังก์ชันเปิด/ปิดการเลือก Checkbox ของผู้ใช้แต่ละคน
   * @param id - รหัส ID ของผู้ใช้งาน
   */
  const handleToggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  /**
   * คำนวณรายชื่อผู้ใช้ที่ผ่านการกรองตาม Search Query และ Role Filter
   */
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // กรองตามบทบาท
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      // กรองตามคำค้นหา
      if (userSearch.trim()) {
        const q = userSearch.toLowerCase();
        return (
          u.name.toLowerCase().includes(q) ||
          u.phone.includes(q) ||
          u.username.toLowerCase().includes(q) ||
          (u.department && u.department.toLowerCase().includes(q)) ||
          (u.nickname && u.nickname.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [users, userRoleFilter, userSearch]);

  /**
   * ฟังก์ชันเลือกหรือยกเลิกการเลือกผู้ใช้ทั้งหมดในรายการที่กรองอยู่
   */
  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredUsers.map((u) => u.id);
    const allSelected = allFilteredIds.every((id) => selectedUserIds.includes(id));
    if (allSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  // ตรวจสอบว่าผู้ใช้ทั้งหมดในรายการที่กรองอยู่ถูกเลือกครบหรือไม่
  const isAllFilteredSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((u) => selectedUserIds.includes(u.id));

  return (
    // โครงเลย์เอาต์หลักของหน้าแอดมิน
    <AppShell
      title="จัดการบทบาทผู้ใช้งาน (Role Management)"
      backHref="/admin"
      rightLabel="แอดมิน"
      maxWidth="max-w-[1120px]"
    >
      <div className="flex flex-col gap-5">
        {/* แบนเนอร์แนะนำระบบ RBAC ด้านบน */}
        <div className="jw-card p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-l-4 border-l-brand">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-brand-mint text-brand">
                <Icon name="shield-check" className="w-5 h-5" />
              </span>
              <h2 className="text-[17px] font-bold text-ink">ระบบจัดการบทบาทและสิทธิ์การเข้าถึง (RBAC)</h2>
            </div>
            <p className="text-[13px] text-ink-mute mt-1 leading-relaxed">
              สิทธิ์การเข้าถึงบริการและเมนูต่างๆ ใน Sidebar จะถูกควบคุมตามบทบาท (Role) ของผู้ใช้งานโดยอัตโนมัติ
              พร้อมการตรวจสอบสิทธิ์ความปลอดภัยที่ Backend ทุก API
            </p>
          </div>
          {/* ปุ่มเพิ่มบทบาทใหม่ (แสดงเฉพาะในแท็บบทบาท) */}
          {mainTab === 'roles' && (
            <button
              type="button"
              onClick={openAddModal}
              className="jw-btn flex items-center gap-1.5 whitespace-nowrap self-stretch sm:self-auto justify-center"
            >
              <Icon name="plus" className="w-4 h-4" />
              <span>เพิ่มบทบาทใหม่</span>
            </button>
          )}
        </div>

        {/* แถบแจ้งเตือนผลลัพธ์การทำงาน (Success / Error) */}
        {successMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[14px] flex items-center gap-2.5 animate-fadeIn">
            <Icon name="check" className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-[14px] flex items-center gap-2.5 animate-fadeIn">
            <Icon name="alert-triangle" className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* แถบแท็บหลักสลับระหว่าง จัดการบทบาท กับ กำหนดบทบาทผู้ใช้ */}
        <Tabs<MainTab>
          value={mainTab}
          onChange={setMainTab}
          options={[
            {
              value: 'roles',
              label: `บทบาทในระบบ (${roles.length})`,
            },
            {
              value: 'assignment',
              label: `กำหนดบทบาทผู้ใช้งาน (${users.length})`,
            },
          ]}
        />

        {/* ==================== TAB 1: ROLES MANAGEMENT ==================== */}
        {mainTab === 'roles' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink-mute">
                แสดงบทบาททั้งหมด {roles.length} บทบาท · กำหนดกลุ่มผู้ใช้งานและบริการที่สามารถเข้าถึงได้
              </span>
            </div>

            {rolesLoading ? (
              <div className="p-12 text-center text-ink-mute text-[14px]">กำลังโหลดรายการบทบาท...</div>
            ) : (
              // แสดงการ์ดรายการบทบาททั้งหมด
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {roles.map((role) => {
                  // ตรวจสอบเงื่อนไขว่าสามารถลบบทบาทนี้ได้หรือไม่ (ต้องไม่ใช่ System Role และไม่มีผู้ใช้งานผูกอยู่)
                  const canDelete = !role.isSystem && role.userCount === 0;
                  return (
                    <div
                      key={role.id}
                      className={`jw-card p-5 flex flex-col justify-between gap-4 transition border ${
                        role.enabled ? 'border-line hover:border-brand/40 bg-white' : 'border-line/60 bg-gray-50/60 opacity-80'
                      }`}
                    >
                      <div>
                        {/* ส่วนหัวการ์ดบทบาท: ป้ายชื่อรหัสบทบาท และสวิตช์เปิด/ปิด */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip tone={role.tone || 'blue'}>{role.key}</Chip>
                            {role.isSystem && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                                บทบาทระบบ
                              </span>
                            )}
                            {!role.enabled && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200">
                                ปิดใช้งาน
                              </span>
                            )}
                          </div>

                          {/* สวิตช์สลับสถานะเปิด/ปิดการใช้งานบทบาท */}
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] text-ink-mute">
                              {role.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                            </span>
                            <Toggle
                              checked={role.enabled}
                              onChange={() => handleToggleRole(role)}
                              disabled={role.key === 'ADMIN'}
                            />
                          </div>
                        </div>

                        {/* ชื่อบทบาทภาษาไทยและคำอธิบาย */}
                        <h3 className="text-[16px] font-bold text-ink">{role.name}</h3>
                        <p className="text-[13px] text-ink-mute mt-1 min-h-[38px] line-clamp-2">
                          {role.description || 'ไม่มีคำอธิบายบทบาท'}
                        </p>
                      </div>

                      {/* ส่วนท้ายการ์ด: แสดงจำนวนผู้ใช้ในบทบาท และปุ่มแก้ไข/ลบ */}
                      <div className="pt-3 border-t border-line flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 text-[13px] text-ink-mute">
                          <Icon name="users" className="w-4 h-4 text-brand" />
                          <span className="font-semibold text-ink">{role.userCount}</span>
                          <span>ผู้ใช้งาน</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* ปุ่มเปิด Modal แก้ไขบทบาท */}
                          <button
                            type="button"
                            onClick={() => openEditModal(role)}
                            className="px-3 py-1.5 rounded-xl border border-line text-[12.5px] font-semibold text-ink hover:bg-soft transition flex items-center gap-1"
                          >
                            <Icon name="edit" className="w-3.5 h-3.5" />
                            <span>แก้ไข</span>
                          </button>

                          {/* ปุ่มเปิด Modal ลบบทบาท */}
                          <button
                            type="button"
                            onClick={() => setDeletingRole(role)}
                            disabled={!canDelete}
                            title={
                              role.isSystem
                                ? 'ไม่สามารถลบบทบาทของระบบได้'
                                : role.userCount > 0
                                ? `มีผู้ใช้งาน ${role.userCount} คนผูกอยู่ ต้องย้ายผู้ใช้ก่อนจึงจะลบได้`
                                : 'ลบบทบาทนี้'
                            }
                            className={`px-3 py-1.5 rounded-xl border text-[12.5px] font-semibold transition flex items-center gap-1 ${
                              canDelete
                                ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                                : 'border-line text-ink-ph opacity-40 cursor-not-allowed'
                            }`}
                          >
                            <Icon name="trash" className="w-3.5 h-3.5" />
                            <span>ลบ</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 2: USER ROLE ASSIGNMENT ==================== */}
        {mainTab === 'assignment' && (
          <div className="flex flex-col gap-4">
            {/* แถบค้นหาและตัวกรองบทบาท */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-ph">
                  <Icon name="search" className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="ค้นหาชื่อผู้ใช้งาน / เบอร์โทร / หน่วยงาน / ชื่อผู้ใช้"
                  className="jw-in rounded-full pl-11 h-[42px] w-full"
                />
              </div>

              {/* เมนู Dropdown กรองตามบทบาท */}
              <div className="flex items-center gap-2">
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="jw-in h-[42px] rounded-full px-4 text-[13px] font-medium border-line"
                >
                  <option value="all">บทบาททั้งหมด ({users.length})</option>
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name} ({r.userCount})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* แถบเครื่องมือจัดการแบบกลุ่ม (Bulk Actions Toolbar - แสดงเมื่อมีการเลือก Checkbox อย่างน้อย 1 คน) */}
            {selectedUserIds.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-brand-mint border border-brand/40 flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center text-[12px] font-bold">
                    {selectedUserIds.length}
                  </span>
                  <span className="text-[13.5px] font-semibold text-ink">
                    เลือกผู้ใช้งานแล้ว {selectedUserIds.length} คน
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* ตัวเลือกบทบาทใหม่สำหรับเปลี่ยนพร้อมกัน */}
                  <select
                    value={bulkTargetRole}
                    onChange={(e) => setBulkTargetRole(e.target.value)}
                    className="jw-in h-[36px] rounded-xl text-[13px] bg-white border-line py-0"
                  >
                    <option value="">-- เลือกบทบาทใหม่ --</option>
                    {roles
                      .filter((r) => r.enabled)
                      .map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.name} ({r.key})
                        </option>
                      ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleBulkAssign}
                    disabled={isBulkAssigning || !bulkTargetRole}
                    className="jw-btn h-[36px] px-3.5 text-[13px] flex items-center gap-1.5"
                  >
                    {isBulkAssigning ? 'กำลังบันทึก...' : 'เปลี่ยนบทบาทที่เลือก'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedUserIds([])}
                    className="jw-btn-sec h-[36px] px-3 text-[13px]"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}

            {/* แถว Checkbox เลือกทั้งหมด (Select All) */}
            <div className="flex items-center justify-between px-2 text-[13px] text-ink-mute">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAllFilteredSelected}
                  onChange={handleSelectAllFiltered}
                  className="w-4 h-4 rounded text-brand border-line focus:ring-brand"
                />
                <span className="font-semibold text-ink">
                  เลือกทั้งหมดในรายการ ({filteredUsers.length} คน)
                </span>
              </label>
              <span>เปลี่ยนบทบาทได้ทันทีจากเมนูในแต่ละแถว</span>
            </div>

            {/* รายชื่อผู้ใช้งาน (Users List) */}
            {usersLoading ? (
              <div className="p-12 text-center text-ink-mute text-[14px]">กำลังโหลดรายชื่อผู้ใช้งาน...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-ink-mute text-[14px] jw-card">
                ไม่พบผู้ใช้งานที่ตรงกับเงื่อนไขการค้นหา
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredUsers.map((user) => {
                  const isSelected = selectedUserIds.includes(user.id);
                  const isSelf = user.id === currentAccount?.id;

                  return (
                    <div
                      key={user.id}
                      className={`jw-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition border ${
                        isSelected
                          ? 'border-brand bg-brand-mint/20'
                          : user.active === false
                          ? 'border-line/60 bg-gray-50/60 opacity-75'
                          : 'border-line hover:border-brand/40 bg-white'
                      }`}
                    >
                      {/* ส่วนซ้าย: Checkbox และข้อมูลผู้ใช้ */}
                      <div className="flex items-start sm:items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectUser(user.id)}
                          className="w-4 h-4 rounded text-brand border-line focus:ring-brand mt-1 sm:mt-0"
                        />

                        {/* อวาตาร์อักษรย่อ */}
                        <div className="w-10 h-10 rounded-full bg-soft text-brand font-bold text-[15px] flex items-center justify-center shrink-0 border border-line">
                          {user.initial || user.name.charAt(0) || 'ผ'}
                        </div>

                        {/* รายละเอียดชื่อ ตำแหน่ง สังกัด และเบอร์โทร */}
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <b className="text-[15px] text-ink">{user.name}</b>
                            {user.nickname && (
                              <span className="text-[12px] text-ink-mute">({user.nickname})</span>
                            )}
                            {isSelf && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-mint text-brand border border-brand/30">
                                บัญชีของคุณ
                              </span>
                            )}
                            {user.active === false && (
                              <Chip tone="red">ระงับบัญชี</Chip>
                            )}
                          </div>
                          <div className="text-[12.5px] text-ink-mute flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <span>{user.position || 'ตำแหน่งไม่ระบุ'}</span>
                            <span>•</span>
                            <span>{user.department || 'หน่วยงานไม่ระบุ'}</span>
                            <span>•</span>
                            <span>{user.phone || '-'}</span>
                            <span className="text-ink-ph">(@{user.username})</span>
                          </div>
                        </div>
                      </div>

                      {/* ส่วนขวา: ตัวเลือกเปลี่ยนบทบาททันที และสวิตช์สถานะเปิด/ระงับบัญชี */}
                      <div className="flex items-center justify-end gap-3 self-end sm:self-center pl-7 sm:pl-0">
                        {/* Dropdown เปลี่ยนบทบาทผู้ใช้แบบรายคน */}
                        <div className="flex items-center gap-1.5">
                          <label className="text-[12px] text-ink-mute whitespace-nowrap">บทบาท:</label>
                          <select
                            value={user.role}
                            onChange={(e) => handleAssignSingleUserRole(user, e.target.value as Role)}
                            disabled={isSelf && user.role === 'ADMIN'}
                            className="jw-in h-[36px] rounded-xl text-[13px] font-medium border-line py-0 pl-3 pr-7 bg-white"
                          >
                            {roles.map((r) => (
                              <option key={r.key} value={r.key} disabled={!r.enabled && user.role !== r.key}>
                                {r.name} {!r.enabled && '(ปิดใช้งาน)'}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* สวิตช์เปิด/ระงับการใช้งานบัญชี */}
                        <div className="flex items-center gap-1.5 pl-2 border-l border-line">
                          <Toggle
                            checked={user.active !== false}
                            onChange={() => handleToggleUserActive(user)}
                            disabled={isSelf}
                            title={isSelf ? 'ไม่สามารถระงับบัญชีตนเองได้' : undefined}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== ADD / EDIT ROLE MODAL ==================== */}
        {isAddRoleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
            <div className="jw-card w-full max-w-lg p-5 sm:p-6 bg-white shadow-xl flex flex-col gap-4">
              {/* ส่วนหัว Modal */}
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <h3 className="text-[17px] font-bold text-ink">
                  {editingRole ? 'แก้ไขข้อมูลบทบาท' : 'เพิ่มบทบาทใหม่'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddRoleModalOpen(false)}
                  className="p-1 rounded-lg text-ink-ph hover:text-ink hover:bg-soft transition"
                >
                  <Icon name="x" className="w-5 h-5" />
                </button>
              </div>

              {/* ข้อความแจ้งเตือนข้อผิดพลาดใน Modal */}
              {roleModalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[13px]">
                  {roleModalError}
                </div>
              )}

              <form onSubmit={handleSaveRole} className="flex flex-col gap-4">
                {/* ช่องกรอกรหัสบทบาท (Role Code) */}
                <div>
                  <label className="jw-lbl">
                    รหัสบทบาท (Role Code){' '}
                    <span className="text-ink-ph font-normal">
                      {editingRole ? '(ไม่สามารถแก้ไขรหัสได้)' : '(ภาษาอังกฤษตัวพิมพ์ใหญ่ เช่น STAFF_PR)'}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={roleFormKey}
                    onChange={(e) => setRoleFormKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                    placeholder="เช่น STAFF_FINANCE, OPERATOR (เว้นว่างเพื่อสร้างอัตโนมัติ)"
                    disabled={!!editingRole}
                    className="jw-in uppercase"
                  />
                </div>

                {/* ช่องกรอกชื่อบทบาทภาษาไทย */}
                <div>
                  <label className="jw-lbl">ชื่อบทบาทภาษาไทย *</label>
                  <input
                    type="text"
                    value={roleFormName}
                    onChange={(e) => setRoleFormName(e.target.value)}
                    placeholder="เช่น เจ้าหน้าที่ประชาสัมพันธ์, เจ้าหน้าที่การเงิน"
                    required
                    className="jw-in"
                  />
                </div>

                {/* ช่องกรอกคำอธิบายหน้าที่ */}
                <div>
                  <label className="jw-lbl">คำอธิบายหน้าที่ / ขอบเขตงาน</label>
                  <textarea
                    value={roleFormDesc}
                    onChange={(e) => setRoleFormDesc(e.target.value)}
                    placeholder="อธิบายหน้าที่ของบทบาทนี้ เพื่อให้ผู้ดูแลระบบคนอื่นเข้าใจได้ง่าย"
                    rows={3}
                    className="jw-in py-2.5 resize-none"
                  />
                </div>

                {/* ตัวเลือกโทนสีของ Badge บทบาท */}
                <div>
                  <label className="jw-lbl">โทนสีป้ายบทบาท (Badge Tone)</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {AVAILABLE_TONES.map((t) => (
                      <button
                        key={t.tone}
                        type="button"
                        onClick={() => setRoleFormTone(t.tone)}
                        className={`h-8 px-3 rounded-full text-[12px] font-semibold border flex items-center gap-1.5 transition ${
                          roleFormTone === t.tone
                            ? 'border-brand bg-brand-mint text-brand shadow-sm ring-1 ring-brand'
                            : 'border-line bg-white text-ink-mute hover:border-brand/40'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${t.colorClass}`} />
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* สวิตช์เปิด/ปิดการใช้งานบทบาท */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-soft border border-line">
                  <div>
                    <b className="text-[14px] text-ink block">สถานะเปิดใช้งานบทบาท</b>
                    <span className="text-[12px] text-ink-mute">
                      หากปิดใช้งาน ผู้ใช้งานจะไม่สามารถเลือกบทบาทนี้ได้
                    </span>
                  </div>
                  <Toggle
                    checked={roleFormEnabled}
                    onChange={setRoleFormEnabled}
                    disabled={editingRole?.key === 'ADMIN'}
                  />
                </div>

                {/* ปุ่มยกเลิกและปุ่มบันทึกใน Modal */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line mt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddRoleModalOpen(false)}
                    className="jw-btn-sec w-24"
                    disabled={roleModalSaving}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="jw-btn px-6 flex items-center gap-1.5"
                    disabled={roleModalSaving}
                  >
                    {roleModalSaving ? 'กำลังบันทึก...' : editingRole ? 'บันทึกการแก้ไข' : 'สร้างบทบาท'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== DELETE ROLE CONFIRMATION MODAL ==================== */}
        {deletingRole && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
            <div className="jw-card w-full max-w-md p-5 sm:p-6 bg-white shadow-xl flex flex-col gap-4">
              <div className="flex items-center gap-3 text-rose-600">
                <span className="p-2 rounded-xl bg-rose-100">
                  <Icon name="trash" className="w-6 h-6" />
                </span>
                <h3 className="text-[17px] font-bold text-ink">ยืนยันการลบบทบาท</h3>
              </div>

              <p className="text-[13.5px] text-ink-mute leading-relaxed">
                คุณแน่ใจหรือไม่ว่าต้องการลบบทบาท{' '}
                <strong className="text-ink font-bold">&ldquo;{deletingRole.name}&rdquo; ({deletingRole.key})</strong>{' '}
                ออกจากระบบ? การกระทำนี้ไม่สามารถย้อนกลับได้
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setDeletingRole(null)}
                  className="jw-btn-sec w-24"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleDeleteRole}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[13.5px] transition"
                >
                  ลบบทบาท
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
