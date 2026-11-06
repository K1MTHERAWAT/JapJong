'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  FolderTree,
  GripVertical,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sliders,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  PublicAccount,
  Role,
  ROLE_LABEL,
  ROLE_TONE,
  ServicePermissions,
  ServiceRelationCheckResult,
  SidebarServiceItem,
  Tone,
} from '@japjong/shared';
import { AppShell } from '@/components/shell';
import { Button, Card, Chip, Feedback, Input, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { resolveNavIcon } from '@/components/nav';

const POPULAR_ICONS = [
  { name: 'Home', label: 'หน้าหลัก' },
  { name: 'Building2', label: 'สถานที่ / อาคาร' },
  { name: 'Package', label: 'อุปกรณ์ / พัสดุ' },
  { name: 'Wrench', label: 'แจ้งซ่อม / ปัญหา' },
  { name: 'FileText', label: 'รายการ / ประวัติ' },
  { name: 'Clock', label: 'เวลา / ประวัติ' },
  { name: 'Bell', label: 'แจ้งเตือน' },
  { name: 'BellRing', label: 'ศูนย์แจ้งเตือน' },
  { name: 'ClipboardList', label: 'ตรวจคำขอ' },
  { name: 'CheckSquare', label: 'ลงนามอนุมัติ' },
  { name: 'QrCode', label: 'คิวอาร์โค้ด' },
  { name: 'Shield', label: 'ความปลอดภัย' },
  { name: 'Users', label: 'ผู้ใช้งาน / กลุ่มคน' },
  { name: 'UserCircle', label: 'บัญชีของฉัน' },
  { name: 'LayoutDashboard', label: 'แดชบอร์ดแอดมิน' },
  { name: 'Smartphone', label: 'LINE / มือถือ' },
  { name: 'Layers', label: 'บริการ / เมนู' },
  { name: 'FolderTree', label: 'หมวดหมู่ / แฟ้ม' },
  { name: 'Star', label: 'บริการเด่น' },
  { name: 'Zap', label: 'สาธารณูปโภค' },
];

const ROLES_LIST: { role: Role; label: string; tone: Tone }[] = [
  { role: 'ADMIN', label: 'ผู้ดูแลระบบ (ADMIN)', tone: 'green' },
  { role: 'STAFF', label: 'เจ้าหน้าที่ (STAFF)', tone: 'blue' },
  { role: 'APPROVER_L2', label: 'ปลัด อบต. (APPROVER_L2)', tone: 'amber' },
  { role: 'APPROVER_L1', label: 'นายก อบต. (APPROVER_L1)', tone: 'amber' },
  { role: 'USER', label: 'ผู้ใช้งานทั่วไป / ประชาชน (USER)', tone: 'gray' },
];

const ACTION_PERMS: { key: keyof ServicePermissions; label: string; desc: string }[] = [
  { key: 'view', label: 'ดูข้อมูล (View)', desc: 'เข้าชมหน้าบริการและดูรายละเอียด' },
  { key: 'create', label: 'เพิ่มข้อมูล (Create)', desc: 'ยื่นคำขอใหม่ หรือสร้างข้อมูล' },
  { key: 'edit', label: 'แก้ไข (Edit)', desc: 'ปรับปรุง แก้ไขข้อมูลหรือคำขอ' },
  { key: 'delete', label: 'ลบ (Delete)', desc: 'ลบข้อมูลหรือยกเลิกรายการ' },
  { key: 'approve', label: 'อนุมัติ (Approve)', desc: 'ลงนามพิจารณาและอนุมัติ' },
  { key: 'manage', label: 'จัดการ (Manage)', desc: 'ตั้งค่าระบบและจัดการสิทธิ์' },
];

export default function AdminServicesPage() {
  const [services, setServices] = useState<SidebarServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [allUsers, setAllUsers] = useState<PublicAccount[]>([]);

  // Dialogs
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<SidebarServiceItem | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingService, setDeletingService] = useState<SidebarServiceItem | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<ServiceRelationCheckResult | null>(null);
  const [checkingDelete, setCheckingDelete] = useState(false);
  const [previewRole, setPreviewRole] = useState<Role | null>(null);

  // Notifications
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form State for Add / Edit
  const [formLabel, setFormLabel] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formHref, setFormHref] = useState('');
  const [formCategory, setFormCategory] = useState('บริการหลัก');
  const [formCustomCategory, setFormCustomCategory] = useState('');
  const [formIcon, setFormIcon] = useState('Layers');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formExact, setFormExact] = useState(false);
  const [formRoles, setFormRoles] = useState<Role[]>(['USER']);
  const [formPerms, setFormPerms] = useState<ServicePermissions>({
    view: true,
    create: false,
    edit: false,
    delete: false,
    approve: false,
    manage: false,
  });
  const [formAllowedUsers, setFormAllowedUsers] = useState<string[]>([]);
  const [formDeniedUsers, setFormDeniedUsers] = useState<string[]>([]);
  const [modalTab, setModalTab] = useState<'info' | 'roles'>('info');

  // Drag and Drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [svcList, userList] = await Promise.all([
        api.adminServices(),
        api.users().catch(() => []),
      ]);
      setServices(svcList);
      setAllUsers(userList);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'ไม่สามารถโหลดข้อมูลบริการได้' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) {
      if (s.category) set.add(s.category);
    }
    return Array.from(set);
  }, [services]);

  // Filtered services
  const filteredServices = useMemo(() => {
    return services
      .filter((s) => {
        if (selectedCategory !== 'ALL' && s.category !== selectedCategory) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchLabel = s.label.toLowerCase().includes(q);
          const matchHref = s.href.toLowerCase().includes(q);
          const matchCat = s.category.toLowerCase().includes(q);
          const matchDesc = (s.description || '').toLowerCase().includes(q);
          return matchLabel || matchHref || matchCat || matchDesc;
        }
        return true;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [services, selectedCategory, search]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingService(null);
    setFormLabel('');
    setFormDesc('');
    setFormHref('');
    setFormCategory('บริการหลัก');
    setFormCustomCategory('');
    setFormIcon('Layers');
    setFormEnabled(true);
    setFormExact(false);
    setFormRoles(['USER', 'STAFF']);
    setFormPerms({
      view: true,
      create: true,
      edit: false,
      delete: false,
      approve: false,
      manage: false,
    });
    setFormAllowedUsers([]);
    setFormDeniedUsers([]);
    setModalTab('info');
    setEditModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (s: SidebarServiceItem) => {
    setEditingService(s);
    setFormLabel(s.label);
    setFormDesc(s.description || '');
    setFormHref(s.href);
    if (categories.includes(s.category)) {
      setFormCategory(s.category);
      setFormCustomCategory('');
    } else {
      setFormCategory('CUSTOM');
      setFormCustomCategory(s.category);
    }
    setFormIcon(s.icon || 'FolderTree');
    setFormEnabled(s.enabled);
    setFormExact(Boolean(s.exact));
    setFormRoles(Array.isArray(s.roles) ? [...s.roles] : ['ADMIN']);
    setFormPerms({
      view: true,
      create: Boolean(s.permissions?.create),
      edit: Boolean(s.permissions?.edit),
      delete: Boolean(s.permissions?.delete),
      approve: Boolean(s.permissions?.approve),
      manage: Boolean(s.permissions?.manage),
    });
    setFormAllowedUsers(Array.isArray(s.allowedUserIds) ? [...s.allowedUserIds] : []);
    setFormDeniedUsers(Array.isArray(s.deniedUserIds) ? [...s.deniedUserIds] : []);
    setModalTab('info');
    setEditModalOpen(true);
  };

  // Save Add / Edit
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLabel.trim()) {
      setFeedback({ type: 'error', message: 'กรุณากรอกชื่อบริการหรือเมนู' });
      return;
    }
    if (!formHref.trim()) {
      setFeedback({ type: 'error', message: 'กรุณากรอก URL หรือ Route เช่น /services/example' });
      return;
    }
    if (formRoles.length === 0) {
      setFeedback({ type: 'error', message: 'กรุณาเลือกบทบาท (Role) อย่างน้อย 1 บทบาท' });
      return;
    }

    // Safety rule: if editing an admin system menu, ADMIN must remain in roles
    const isAdminMenu =
      editingService?.isSystem ||
      formHref === '/admin' ||
      formHref.startsWith('/admin/');
    if (isAdminMenu && !formRoles.includes('ADMIN')) {
      setFeedback({
        type: 'error',
        message: 'ไม่สามารถนำบทบาทผู้ดูแลระบบ (ADMIN) ออกจากเมนูระบบหลักได้ เพื่อความปลอดภัย',
      });
      return;
    }

    const finalCategory =
      formCategory === 'CUSTOM' ? formCustomCategory.trim() || 'บริการทั่วไป' : formCategory;

    try {
      if (editingService) {
        await api.updateService(editingService.id, {
          label: formLabel.trim(),
          description: formDesc.trim(),
          href: formHref.trim(),
          category: finalCategory,
          icon: formIcon,
          enabled: formEnabled,
          exact: formExact,
          roles: formRoles,
          permissions: formPerms,
          allowedUserIds: formAllowedUsers,
          deniedUserIds: formDeniedUsers,
        });
        setFeedback({ type: 'success', message: `บันทึกการแก้ไขบริการ "${formLabel}" เรียบร้อยแล้ว` });
      } else {
        await api.createService({
          label: formLabel.trim(),
          description: formDesc.trim(),
          href: formHref.trim(),
          category: finalCategory,
          icon: formIcon,
          enabled: formEnabled,
          exact: formExact,
          roles: formRoles,
          permissions: formPerms,
          allowedUserIds: formAllowedUsers,
          deniedUserIds: formDeniedUsers,
        });
        setFeedback({ type: 'success', message: `เพิ่มบริการใหม่ "${formLabel}" เรียบร้อยแล้ว` });
      }
      setEditModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'เกิดข้อผิดพลาดในการบันทึกบริการ' });
    }
  };

  // Toggle active/inactive
  const handleToggle = async (s: SidebarServiceItem) => {
    try {
      // Optimistic update
      setServices((prev) =>
        prev.map((item) => (item.id === s.id ? { ...item, enabled: !item.enabled } : item)),
      );
      const updated = await api.toggleService(s.id);
      setFeedback({
        type: 'success',
        message: `${updated.enabled ? 'เปิด' : 'ปิด'}การใช้งานบริการ "${updated.label}" เรียบร้อยแล้ว`,
      });
    } catch (err: any) {
      // Rollback
      setServices((prev) =>
        prev.map((item) => (item.id === s.id ? { ...item, enabled: s.enabled } : item)),
      );
      setFeedback({ type: 'error', message: err?.message || 'ไม่สามารถเปลี่ยนสถานะบริการได้' });
    }
  };

  // Open Delete Modal
  const handleOpenDelete = async (s: SidebarServiceItem) => {
    setDeletingService(s);
    setCheckingDelete(true);
    setDeleteModalOpen(true);
    try {
      const check = await api.checkDeleteService(s.id);
      setDeleteCheck(check);
    } catch (err: any) {
      setDeleteCheck({
        canDelete: false,
        isSystem: Boolean(s.isSystem),
        reasons: [err?.message || 'ไม่สามารถตรวจสอบความสัมพันธ์ได้'],
        relatedRequestsCount: 0,
        relatedResourcesCount: 0,
      });
    } finally {
      setCheckingDelete(false);
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deletingService) return;
    try {
      await api.deleteService(deletingService.id);
      setFeedback({ type: 'success', message: `ลบบริการ "${deletingService.label}" สำเร็จ` });
      setDeleteModalOpen(false);
      setDeletingService(null);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'ไม่สามารถลบบริการได้' });
    }
  };

  // Move Up / Move Down
  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= filteredServices.length) return;

    const currentItem = filteredServices[index];
    const targetItem = filteredServices[targetIndex];

    const currentOrder = currentItem.sortOrder;
    const targetOrder = targetItem.sortOrder;

    const updatedItems = [
      { id: currentItem.id, sortOrder: targetOrder },
      { id: targetItem.id, sortOrder: currentOrder },
    ];

    try {
      // Optimistic update
      setServices((prev) =>
        prev.map((s) => {
          if (s.id === currentItem.id) return { ...s, sortOrder: targetOrder };
          if (s.id === targetItem.id) return { ...s, sortOrder: currentOrder };
          return s;
        }),
      );
      await api.reorderServices(updatedItems);
      setFeedback({ type: 'success', message: 'อัปเดตลำดับเมนูเรียบร้อยแล้ว' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'ไม่สามารถจัดลำดับได้' });
      await loadData();
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }

    const items = [...filteredServices];
    const fromIdx = items.findIndex((i) => i.id === draggedId);
    const toIdx = items.findIndex((i) => i.id === targetId);
    if (fromIdx === -1 || toIdx === -1) {
      setDraggedId(null);
      return;
    }

    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);

    // Reassign sequential sortOrders
    const reorderedPayload = items.map((item, idx) => ({
      id: item.id,
      sortOrder: idx + 1,
    }));

    try {
      // Optimistic
      setServices((prev) => {
        const orderMap = new Map(reorderedPayload.map((p) => [p.id, p.sortOrder]));
        return prev.map((s) => (orderMap.has(s.id) ? { ...s, sortOrder: orderMap.get(s.id)! } : s));
      });
      await api.reorderServices(reorderedPayload);
      setFeedback({ type: 'success', message: 'จัดเรียงลำดับเมนูด้วยการลากวางสำเร็จ' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'ไม่สามารถบันทึกลำดับได้' });
      await loadData();
    } finally {
      setDraggedId(null);
    }
  };

  // Role preview list
  const previewItems = useMemo(() => {
    if (!previewRole) return [];
    return services
      .filter((s) => {
        if (!s.enabled) return false;
        if (previewRole === 'ADMIN') {
          const isCitizenOrStaffService = [
            '/',
            '/booking',
            '/borrow',
            '/repair',
            '/borrow/my',
            '/history',
            '/notifications',
            '/account',
            '/staff/review',
            '/staff/repairs',
            '/staff/walk-in',
            '/staff/verify',
          ].includes(s.href);
          if (isCitizenOrStaffService && !s.href.startsWith('/admin')) {
            return false;
          }
        }
        if (previewRole === 'STAFF' && s.href === '/repair') return false;
        return s.roles.includes(previewRole);
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [services, previewRole]);

  return (
    <AppShell title="จัดการบริการและเมนูระบบ" maxWidth="max-w-[1240px]">
      <div className="flex flex-col gap-6">
        {/* Breadcrumb & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[12px] text-ink-mute">
              <Link href="/admin" className="hover:text-brand transition">
                ผู้ดูแลระบบ
              </Link>
              <ChevronRight className="size-3" />
              <span className="text-ink font-medium">จัดการบริการและเมนู Sidebar</span>
            </div>
            <h1 className="text-[22px] sm:text-[26px] font-bold text-ink tracking-tight flex items-center gap-2.5">
              <Layers className="size-6 text-brand" />
              จัดการบริการและเมนู Sidebar ตามสิทธิ์
            </h1>
            <p className="text-[13px] text-ink-mute">
              เพิ่ม ลบ แก้ไข จัดหมวดหมู่ เรียงลำดับเมนู และกำหนดสิทธิ์การเข้าถึงบริการของประชาชนและเจ้าหน้าที่
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setPreviewRole(previewRole ? null : 'USER')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-control border text-body font-medium transition shadow-xs ${
                previewRole
                  ? 'bg-brand text-white border-brand shadow-sm'
                  : 'bg-surface border-line text-ink hover:bg-hover'
              }`}
            >
              <Eye className="size-4" />
              <span>{previewRole ? 'ปิดการพรีวิว' : 'พรีวิว Sidebar'}</span>
            </button>

            <Button variant="primary" onClick={handleOpenCreate} className="gap-2">
              <Plus className="size-4" />
              <span>เพิ่มบริการใหม่</span>
            </Button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <Feedback tone={feedback.type === 'error' ? 'crit' : 'brand'}>
            <div className="flex items-center justify-between gap-3 w-full">
              <span>{feedback.message}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-current hover:opacity-75 shrink-0"
              >
                <X className="size-4" />
              </button>
            </div>
          </Feedback>
        )}

        {/* KPI / Overview Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[12px] text-ink-mute">บริการทั้งหมด</span>
            <b className="text-[24px] text-brand leading-tight">{services.length}</b>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[12px] text-ink-mute">เปิดใช้งานอยู่</span>
            <b className="text-[24px] text-emerald-600 leading-tight">
              {services.filter((s) => s.enabled).length}
            </b>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[12px] text-ink-mute">ปิดชั่วคราว</span>
            <b className="text-[24px] text-amber-600 leading-tight">
              {services.filter((s) => !s.enabled).length}
            </b>
          </div>
          <div className="jw-card p-4 flex flex-col gap-1">
            <span className="text-[12px] text-ink-mute">หมวดหมู่บริการ</span>
            <b className="text-[24px] text-ink leading-tight">{categories.length}</b>
          </div>
        </div>

        {/* Live Role Preview Panel (Collapsible) */}
        {previewRole && (
          <div className="jw-card p-5 border-2 border-brand/40 bg-brand-mint/10 rounded-2xl flex flex-col gap-4 transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand/20 pb-3">
              <div>
                <b className="text-[15px] text-brand-ink flex items-center gap-2">
                  <Eye className="size-4" />
                  จำลองการมองเห็น Sidebar ตามบทบาทผู้ใช้งาน (Live Role Preview)
                </b>
                <span className="text-[12px] text-ink-mute">
                  ตรวจสอบทันทีว่าผู้ใช้งานในแต่ละบทบาทจะเห็นเมนูใดบ้างตามการตั้งค่าสิทธิ์ปัจจุบัน
                </span>
              </div>
              <button
                onClick={() => setPreviewRole(null)}
                className="size-7 grid place-items-center rounded-control hover:bg-hover text-ink-soft self-end sm:self-center"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Role Switcher Tabs */}
            <div className="flex flex-wrap gap-2">
              {ROLES_LIST.map((r) => (
                <button
                  key={r.role}
                  onClick={() => setPreviewRole(r.role)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition ${
                    previewRole === r.role
                      ? 'bg-brand text-white shadow-xs'
                      : 'bg-surface border border-line text-ink-soft hover:bg-hover'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Simulated Sidebar */}
            <div className="bg-surface rounded-xl p-4 border border-line shadow-xs">
              <div className="text-[12px] font-semibold text-ink-mute mb-2">
                เมนู Sidebar ที่ปรากฏสำหรับ: <span className="text-brand font-bold">{ROLE_LABEL[previewRole]}</span> ({previewItems.length} เมนู)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {previewItems.map((item) => {
                  const IconComp = resolveNavIcon(item.icon);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-2.5 rounded-control bg-ground border border-line-soft hover:border-brand/40 transition"
                    >
                      <div className="size-8 rounded-control bg-brand-tint text-brand flex items-center justify-center shrink-0">
                        <IconComp className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-ink truncate">{item.label}</div>
                        <div className="text-[11px] text-ink-mute truncate">{item.href}</div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-line-soft text-ink-mute">
                        {item.category}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="jw-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-1.5 rounded-control text-[12px] font-medium transition ${
                selectedCategory === 'ALL'
                  ? 'bg-brand-tint text-brand-ink font-semibold'
                  : 'text-ink-soft hover:bg-hover'
              }`}
            >
              ทั้งหมด ({services.length})
            </button>
            {categories.map((cat) => {
              const count = services.filter((s) => s.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-control text-[12px] font-medium transition ${
                    selectedCategory === cat
                      ? 'bg-brand-tint text-brand-ink font-semibold'
                      : 'text-ink-soft hover:bg-hover'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อบริการ, URL, หรือหมวดหมู่..."
              className="w-full pl-9 pr-3 py-1.5 text-[13px] rounded-control border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Services Table List */}
        <div className="jw-card overflow-hidden">
          <div className="p-4 border-b border-line flex items-center justify-between">
            <div className="flex items-center gap-2">
              <b className="text-[15px] text-ink">รายการบริการและเมนู Sidebar</b>
              <span className="text-[12px] text-ink-mute">
                ({filteredServices.length} รายการ - ลากที่แถบไอคอน ⠿ เพื่อจัดเรียงลำดับ)
              </span>
            </div>
            <button
              onClick={loadData}
              title="รีเฟรชข้อมูล"
              className="size-8 grid place-items-center rounded-control hover:bg-hover text-ink-soft transition"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {filteredServices.length === 0 ? (
            <div className="p-12 text-center text-ink-mute flex flex-col items-center justify-center gap-2">
              <FolderTree className="size-10 text-line" />
              <span>ไม่พบข้อมูลบริการตามเงื่อนไขที่เลือก</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="bg-ground/60 border-b border-line text-[11px] font-semibold text-ink-mute uppercase tracking-wider">
                    <th className="py-3 px-3 w-10 text-center">ลำดับ</th>
                    <th className="py-3 px-3 min-w-[200px]">บริการ / เมนู</th>
                    <th className="py-3 px-3 min-w-[130px]">URL / Route</th>
                    <th className="py-3 px-3 min-w-[120px]">หมวดหมู่</th>
                    <th className="py-3 px-3 min-w-[180px]">บทบาทที่เห็น (Roles)</th>
                    <th className="py-3 px-3 w-28 text-center">สถานะ</th>
                    <th className="py-3 px-3 w-28 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {filteredServices.map((item, idx) => {
                    const IconComp = resolveNavIcon(item.icon);
                    const isDragging = draggedId === item.id;

                    return (
                      <tr
                        key={item.id}
                        draggable
                        onDragStart={() => handleDragStart(item.id)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(item.id)}
                        className={`hover:bg-hover/60 transition-colors ${
                          isDragging ? 'opacity-40 bg-brand-tint/20' : ''
                        } ${!item.enabled ? 'bg-ground/40 text-ink-mute' : ''}`}
                      >
                        {/* Drag Handle & Order */}
                        <td className="py-3 px-2 text-center align-middle">
                          <div className="flex items-center justify-center gap-0.5">
                            <span
                              title="ลากเพื่อจัดลำดับ"
                              className="cursor-grab active:cursor-grabbing text-ink-mute hover:text-brand p-1"
                            >
                              <GripVertical className="size-4" />
                            </span>
                            <div className="flex flex-col">
                              <button
                                disabled={idx === 0}
                                onClick={() => handleMoveOrder(idx, 'up')}
                                title="เลื่อนขึ้น"
                                className="text-ink-mute hover:text-ink disabled:opacity-20"
                              >
                                <ArrowUp className="size-3" />
                              </button>
                              <button
                                disabled={idx === filteredServices.length - 1}
                                onClick={() => handleMoveOrder(idx, 'down')}
                                title="เลื่อนลง"
                                className="text-ink-mute hover:text-ink disabled:opacity-20"
                              >
                                <ArrowDown className="size-3" />
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* Name & Icon */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-3">
                            <div className="size-9 rounded-control bg-brand-tint text-brand flex items-center justify-center shrink-0 border border-brand/20">
                              <IconComp className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-ink flex items-center gap-1.5">
                                <span className="truncate">{item.label}</span>
                                {item.isSystem && (
                                  <span
                                    title="เมนูระบบหลัก"
                                    className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-600 font-normal"
                                  >
                                    ระบบหลัก
                                  </span>
                                )}
                              </div>
                              {item.description && (
                                <div className="text-[11px] text-ink-mute truncate max-w-xs">
                                  {item.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Route / Href */}
                        <td className="py-3 px-3 font-mono text-[12px] text-ink-soft">
                          <span className="bg-surface px-2 py-0.5 rounded border border-line-soft">
                            {item.href}
                          </span>
                        </td>

                        {/* Category */}
                        <td className="py-3 px-3">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-surface border border-line text-ink">
                            {item.category}
                          </span>
                        </td>

                        {/* Roles */}
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {item.roles.map((r) => {
                              const meta = ROLES_LIST.find((m) => m.role === r);
                              return (
                                <Chip key={r} tone={meta?.tone || 'gray'} className="text-[11px] py-0 px-1.5">
                                  {r}
                                </Chip>
                              );
                            })}
                          </div>
                        </td>

                        {/* Status Toggle */}
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <Toggle
                              checked={item.enabled}
                              onChange={() => handleToggle(item)}
                            />
                            <span
                              className={`text-[11px] font-medium ${
                                item.enabled ? 'text-emerald-700' : 'text-ink-mute'
                              }`}
                            >
                              {item.enabled ? 'เปิดใช้งาน' : 'ปิดชั่วคราว'}
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEdit(item)}
                              className="px-2.5 py-1 text-[12px] font-medium rounded-control border border-line hover:bg-hover text-ink transition"
                            >
                              แก้ไข
                            </button>
                            <button
                              onClick={() => handleOpenDelete(item)}
                              title="ลบบริการ"
                              className="size-7 grid place-items-center rounded-control hover:bg-danger-fg/10 text-danger-fg transition"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ===================== MODAL: Create / Edit Service ===================== */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs">
          <div className="jw-card w-full max-w-2xl max-h-[90vh] flex flex-col shadow-pop animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-line">
              <b className="text-[16px] text-ink flex items-center gap-2">
                <Sliders className="size-5 text-brand" />
                {editingService ? `แก้ไขบริการ: ${editingService.label}` : 'เพิ่มบริการหรือเมนูใหม่ใน Sidebar'}
              </b>
              <button
                onClick={() => setEditModalOpen(false)}
                className="size-8 grid place-items-center rounded-control hover:bg-hover text-ink-soft"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-line px-4 pt-2 gap-4">
              <button
                type="button"
                onClick={() => setModalTab('info')}
                className={`pb-2.5 text-[13px] font-medium transition border-b-2 ${
                  modalTab === 'info'
                    ? 'border-brand text-brand-ink font-semibold'
                    : 'border-transparent text-ink-mute hover:text-ink'
                }`}
              >
                1. ข้อมูลบริการ & ไอคอน
              </button>
              <button
                type="button"
                onClick={() => setModalTab('roles')}
                className={`pb-2.5 text-[13px] font-medium transition border-b-2 ${
                  modalTab === 'roles'
                    ? 'border-brand text-brand-ink font-semibold'
                    : 'border-transparent text-ink-mute hover:text-ink'
                }`}
              >
                2. กำหนดสิทธิ์บทบาท (Roles)
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveService} className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              {modalTab === 'info' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[13px] font-medium text-ink">
                        ชื่อบริการ / เมนู <span className="text-danger-fg">*</span>
                      </label>
                      <input
                        type="text"
                        value={formLabel}
                        onChange={(e) => setFormLabel(e.target.value)}
                        placeholder="เช่น ขอใช้สถานที่, แจ้งซ่อม"
                        className="px-3 py-2 text-[13px] rounded-control border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[13px] font-medium text-ink">
                        URL / Path ในระบบ <span className="text-danger-fg">*</span>
                      </label>
                      <input
                        type="text"
                        value={formHref}
                        onChange={(e) => setFormHref(e.target.value)}
                        placeholder="เช่น /booking, /services/my-service"
                        className="px-3 py-2 text-[13px] font-mono rounded-control border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium text-ink">คำอธิบายบริการ</label>
                    <textarea
                      rows={2}
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="คำอธิบายสั้น ๆ เกี่ยวกับการให้บริการหรือวัตถุประสงค์ของเมนูนี้"
                      className="px-3 py-2 text-[13px] rounded-control border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>

                  {/* Category Selection */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[13px] font-medium text-ink">หมวดหมู่ / กลุ่มบริการ</label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className="px-3 py-2 text-[13px] rounded-control border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
                      >
                        <option value="บริการหลัก">บริการหลัก</option>
                        <option value="รายการและประวัติ">รายการและประวัติ</option>
                        <option value="งานเจ้าหน้าที่">งานเจ้าหน้าที่</option>
                        <option value="งานผู้บริหาร">งานผู้บริหาร</option>
                        <option value="ระบบและผู้ดูแล">ระบบและผู้ดูแล</option>
                        <option value="บัญชีผู้ใช้งาน">บัญชีผู้ใช้งาน</option>
                        <option value="CUSTOM">+ เพิ่มหมวดหมู่ใหม่...</option>
                      </select>
                    </div>

                    {formCategory === 'CUSTOM' && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[13px] font-medium text-ink">ชื่อหมวดหมู่ใหม่</label>
                        <input
                          type="text"
                          value={formCustomCategory}
                          onChange={(e) => setFormCustomCategory(e.target.value)}
                          placeholder="เช่น บริการสาธารณสุข, กิจการพาณิชย์"
                          className="px-3 py-2 text-[13px] rounded-control border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
                          required
                        />
                      </div>
                    )}
                  </div>

                  {/* Icon Picker */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[13px] font-medium text-ink flex items-center justify-between">
                      <span>เลือกไอคอนเมนู</span>
                      <span className="text-[11px] text-ink-mute">ไอคอนปัจจุบัน: {formIcon}</span>
                    </label>
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 max-h-40 overflow-y-auto p-2 border border-line rounded-control bg-surface-muted/40">
                      {POPULAR_ICONS.map((ic) => {
                        const IconComponent = resolveNavIcon(ic.name);
                        const isSelected = formIcon === ic.name;
                        return (
                          <button
                            type="button"
                            key={ic.name}
                            onClick={() => setFormIcon(ic.name)}
                            className={`flex flex-col items-center gap-1 p-2 rounded-control border text-center transition ${
                              isSelected
                                ? 'bg-brand text-white border-brand shadow-xs'
                                : 'bg-surface border-line-soft text-ink-soft hover:bg-hover'
                            }`}
                          >
                            <IconComponent className="size-4" />
                            <span className="text-[10px] truncate max-w-full">{ic.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Status & Options */}
                  <div className="flex items-center justify-between p-3 rounded-control bg-ground border border-line-soft">
                    <div>
                      <div className="text-[13px] font-semibold text-ink">สถานะการเปิดให้บริการ</div>
                      <div className="text-[11px] text-ink-mute">
                        หากปิดใช้งาน ระบบจะซ่อนเมนูและระงับการเข้า URL โดยตรง
                      </div>
                    </div>
                    <Toggle
                      checked={formEnabled}
                      onChange={(next) => setFormEnabled(next)}
                    />
                  </div>
                </>
              )}

              {modalTab === 'roles' && (
                <>
                  <div className="flex flex-col gap-3">
                    <div>
                      <b className="text-[14px] text-ink">บทบาทที่ได้รับสิทธิ์มองเห็นบริการนี้</b>
                      <p className="text-[12px] text-ink-mute">
                        เลือก Role ที่จะเห็นเมนูใน Sidebar และสามารถเข้าใช้งานบริการได้
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      {ROLES_LIST.map((r) => {
                        const checked = formRoles.includes(r.role);
                        return (
                          <label
                            key={r.role}
                            className={`flex items-center justify-between p-3 rounded-control border cursor-pointer transition ${
                              checked
                                ? 'border-brand bg-brand-mint/15'
                                : 'border-line bg-surface hover:bg-hover'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormRoles([...formRoles, r.role]);
                                  } else {
                                    setFormRoles(formRoles.filter((item) => item !== r.role));
                                  }
                                }}
                                className="size-4 rounded text-brand focus:ring-brand"
                              />
                              <div>
                                <div className="text-[13px] font-semibold text-ink">{r.label}</div>
                                <div className="text-[11px] text-ink-mute">
                                  {r.role === 'ADMIN' && 'ผู้ดูแลระบบสูงสุด จัดการได้ทุกส่วน'}
                                  {r.role === 'STAFF' && 'เจ้าหน้าที่ อบต. ตรวจสอบและประสานงาน'}
                                  {r.role === 'APPROVER_L2' && 'ปลัด อบต. พิจารณาและลงนามระดับ 2'}
                                  {r.role === 'APPROVER_L1' && 'นายก อบต. ลงนามอนุมัติขั้นสุดท้าย'}
                                  {r.role === 'USER' && 'ประชาชนและหน่วยงานภายนอก ยื่นคำขอ'}
                                </div>
                              </div>
                            </div>
                            <Chip tone={r.tone}>{r.role}</Chip>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 border-t border-line pt-4 mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button type="submit" variant="primary">
                  บันทึกข้อมูลบริการ
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: Confirm Delete & Relations Check ===================== */}
      {deleteModalOpen && deletingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs">
          <div className="jw-card w-full max-w-md p-5 flex flex-col gap-4 shadow-pop animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-full bg-red-100 text-danger-fg flex items-center justify-center shrink-0">
                <AlertTriangle className="size-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-[16px] font-bold text-ink">
                  ตรวจสอบความสัมพันธ์ก่อนลบบริการ
                </h3>
                <p className="text-[13px] text-ink-mute mt-1">
                  บริการ: <b className="text-ink">{deletingService.label}</b> ({deletingService.href})
                </p>
              </div>
            </div>

            {checkingDelete ? (
              <div className="p-6 text-center text-ink-mute flex flex-col items-center gap-2">
                <div className="size-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                <span className="text-[12px]">กำลังตรวจสอบข้อมูลที่เกี่ยวข้องในระบบ...</span>
              </div>
            ) : deleteCheck ? (
              <div className="flex flex-col gap-3">
                {deleteCheck.canDelete ? (
                  <div className="p-3 rounded-control bg-emerald-50 border border-emerald-200 text-emerald-800 text-[12px]">
                    <div className="font-semibold flex items-center gap-1.5 mb-1">
                      <CheckCircle2 className="size-4 text-emerald-600" />
                      ปลอดภัย สามารถลบได้
                    </div>
                    ไม่พบบันทึกคำขอหรือความสัมพันธ์กับทรัพยากรหลักที่เชื่อมโยงกับบริการนี้
                  </div>
                ) : (
                  <div className="p-3 rounded-control bg-amber-50 border border-amber-200 text-amber-900 text-[12px] flex flex-col gap-2">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                      <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                      ไม่สามารถลบบริการนี้ได้เนื่องจากมีความสัมพันธ์ในระบบ
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800">
                      {deleteCheck.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                    <div className="mt-1 text-[11px] font-medium text-ink bg-white/70 p-2 rounded border border-amber-200">
                      💡 คำแนะนำ: แนะนำให้ใช้การ "ปิดการใช้งานบริการ" แทน เพื่อซ่อนเมนูจากผู้ใช้โดยยังคงรักษาความถูกต้องของข้อมูลประวัติคำขอ
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleteModalOpen(false)}
              >
                ยกเลิก
              </Button>
              {deleteCheck && !deleteCheck.canDelete && deletingService.enabled && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={async () => {
                    await handleToggle(deletingService);
                    setDeleteModalOpen(false);
                  }}
                >
                  ปิดการใช้งานแทน
                </Button>
              )}
              {deleteCheck && deleteCheck.canDelete && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleConfirmDelete}
                >
                  ยืนยันการลบ
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
