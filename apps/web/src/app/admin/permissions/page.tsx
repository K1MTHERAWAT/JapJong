'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSION_META,
  PermissionKey,
  PublicAccount,
  ROLE_LABEL,
  ROLE_META,
  ROLE_TONE,
  Role,
} from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Chip, Tabs, Toggle } from '@/components/ui';
import { api } from '@/lib/api';

type ViewMode = 'users' | 'matrix';
type RoleTab = 'all' | 'USER' | 'STAFF' | 'APPROVER' | 'ADMIN';

const ROLES: Role[] = ['USER', 'STAFF', 'APPROVER_L2', 'APPROVER_L1', 'ADMIN'];

export default function AdminPermissionsPage() {
  const { refreshMe } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('users');
  const [users, setUsers] = useState<PublicAccount[]>([]);
  const [tab, setTab] = useState<RoleTab>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('s-suda');
  const [userDetailTab, setUserDetailTab] = useState<'permissions' | 'account'>('permissions');
  const [roleDraft, setRoleDraft] = useState<Role>('STAFF');
  const [activeDraft, setActiveDraft] = useState<boolean>(true);
  const [permDraft, setPermDraft] = useState<Record<PermissionKey, boolean>>({
    ...DEFAULT_PERMISSIONS.STAFF,
  });
  const [nameDraft, setNameDraft] = useState('');
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [departmentDraft, setDepartmentDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [newPasswordDraft, setNewPasswordDraft] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const load = useCallback(() => {
    api.users().then((list) => {
      setUsers(list);
      const current = list.find((u) => u.id === selectedId) ?? list[0];
      if (current) {
        setSelectedId(current.id);
        setRoleDraft(current.role);
        setActiveDraft(current.active !== false);
        setPermDraft({ ...DEFAULT_PERMISSIONS[current.role], ...current.permissions });
        setNameDraft(current.name || '');
        setNicknameDraft(current.nickname || '');
        setDepartmentDraft(current.department || '');
        setPhoneDraft(current.phone || '');
        setNewPasswordDraft('');
      }
    });
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectUser = (u: PublicAccount) => {
    setSelectedId(u.id);
    setRoleDraft(u.role);
    setActiveDraft(u.active !== false);
    setPermDraft({ ...DEFAULT_PERMISSIONS[u.role], ...u.permissions });
    setNameDraft(u.name || '');
    setNicknameDraft(u.nickname || '');
    setDepartmentDraft(u.department || '');
    setPhoneDraft(u.phone || '');
    setNewPasswordDraft('');
    setErrorMsg('');
  };

  const handleRolePick = (r: Role) => {
    setRoleDraft(r);
    setPermDraft({ ...DEFAULT_PERMISSIONS[r] });
  };

  const handleSave = async () => {
    setErrorMsg('');
    try {
      await api.updatePermissions(selectedId, {
        role: roleDraft,
        permissions: permDraft,
        active: activeDraft,
        name: nameDraft.trim(),
        nickname: nicknameDraft.trim(),
        department: departmentDraft.trim(),
        phone: phoneDraft.trim(),
        newPassword: newPasswordDraft.trim() ? newPasswordDraft.trim() : undefined,
      });
      await refreshMe();
      load();
      setSavedMsg('บันทึกข้อมูลบัญชี บทบาท และสิทธิ์การใช้งานเรียบร้อยแล้ว (มีผลทันทีทั้งหน้าเว็บและ API)');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err) {
      setErrorMsg((err as Error).message || 'ไม่สามารถบันทึกข้อมูลได้');
    }
  };

  const filtered = users.filter((u) => {
    if (tab === 'USER' && u.role !== 'USER') return false;
    if (tab === 'STAFF' && u.role !== 'STAFF') return false;
    if (tab === 'APPROVER' && u.role !== 'APPROVER_L2' && u.role !== 'APPROVER_L1') return false;
    if (tab === 'ADMIN' && u.role !== 'ADMIN') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.phone.includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.department.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <AppShell
      title="จัดการสิทธิ์และบทบาท"
      backHref="/admin"
      rightLabel="แอดมิน"
      maxWidth="max-w-[1120px]"
      footer={
        viewMode === 'users' ? (
          <div className="flex w-full sm:w-auto gap-2.5">
            <button type="button" onClick={load} className="jw-btn-sec flex-1 sm:w-36">
              ยกเลิก
            </button>
            <button type="button" onClick={handleSave} className="jw-btn flex-[1.5] sm:w-52">
              บันทึกการเปลี่ยนแปลง
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {/* สลับมุมมอง: กำหนดสิทธิ์รายบัญชี vs ตารางโครงสร้างสิทธิ์ 5 บทบาท */}
        <Tabs<ViewMode>
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'users', label: 'กำหนดสิทธิ์รายผู้ใช้ (6 บัญชี)' },
            { value: 'matrix', label: 'ตารางโครงสร้างสิทธิ์ 5 บทบาท & การลงนาม 3 ระดับ' },
          ]}
        />

        {viewMode === 'users' ? (
          <>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-ph">
                <Icon name="search" className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ / เบอร์โทร / หน่วยงาน"
                className="jw-in rounded-full pl-11 h-[42px]"
              />
            </div>

            <Tabs<RoleTab>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'all', label: 'ทั้งหมด' },
                { value: 'USER', label: 'ประชาชน' },
                { value: 'STAFF', label: 'เจ้าหน้าที่' },
                { value: 'APPROVER', label: 'ผู้อนุมัติ (L2/L1)' },
                { value: 'ADMIN', label: 'แอดมิน' },
              ]}
            />

            <div className="flex flex-col gap-2.5">
              {filtered.map((u) => {
                const active = u.id === selectedId;
                return (
                  <React.Fragment key={u.id}>
                    <div
                      onClick={() => selectUser(u)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition ${
                        active ? 'border-ink bg-brand-mint' : 'border-line bg-white hover:border-brand'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <b className="text-[15px] text-ink">{u.name}</b>
                          <span className="text-[12px] text-ink-mute ml-2">
                            ({u.position} · {u.department} · {u.phone})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {u.active === false && <Chip tone="red">ระงับบัญชี</Chip>}
                          <Chip tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Chip>
                        </div>
                      </div>
                    </div>

                    {active && (
                      <div className="jw-card p-4 sm:p-5 flex flex-col gap-4 border-brand">
                        <Tabs<'permissions' | 'account'>
                          value={userDetailTab}
                          onChange={setUserDetailTab}
                          options={[
                            { value: 'permissions', label: 'บทบาท & สิทธิ์การใช้งาน' },
                            { value: 'account', label: 'บัญชี (แก้ไขชื่อ · หน่วยงาน · รหัสผ่าน)' },
                          ]}
                        />

                        {userDetailTab === 'permissions' ? (
                          <>
                            <div className="border border-line rounded-2xl p-3.5 bg-white flex items-center justify-between gap-3">
                              <div>
                                <b className="block text-[14px] text-ink">สถานะการเปิด/ปิดการใช้งานบัญชี</b>
                                <span className="text-[12px] text-ink-mute">
                                  {activeDraft
                                    ? 'เปิดใช้งานปกติ (สามารถเข้าสู่ระบบและดำเนินการตามสิทธิ์ได้)'
                                    : 'ปิด/ระงับการใช้งานชั่วคราว (ไม่สามารถเข้าสู่ระบบได้)'}
                                </span>
                              </div>
                              <Toggle checked={activeDraft} onChange={setActiveDraft} />
                            </div>

                            <div>
                              <label className="jw-lbl">1. เลือกบทบาทหลัก (Role)</label>
                              <div className="flex flex-wrap gap-2">
                                {ROLES.map((r) => (
                                  <button
                                    key={r}
                                    type="button"
                                    onClick={() => handleRolePick(r)}
                                    className={`h-[38px] px-3.5 rounded-full border-[1.5px] text-[13px] font-semibold transition ${
                                      roleDraft === r
                                        ? 'bg-brand border-brand text-white'
                                        : 'bg-white border-line text-ink hover:border-brand'
                                    }`}
                                  >
                                    {ROLE_META[r].shortLabel}
                                  </button>
                                ))}
                              </div>
                              <div className="mt-2.5 rounded-2xl bg-soft border border-line p-3 text-[13px]">
                                <b className="text-ink block">{ROLE_META[roleDraft].label}</b>
                                <span className="text-ink-mute">{ROLE_META[roleDraft].summary}</span>
                              </div>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="jw-lbl mb-0">
                                  2. กำหนดสิทธิ์ย่อยรายเมนูและ API (Permissions 6 รายการ)
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setPermDraft({ ...DEFAULT_PERMISSIONS[roleDraft] })}
                                  className="text-[12px] text-brand font-semibold hover:underline"
                                >
                                  คืนค่ามาตรฐานของบทบาทนี้
                                </button>
                              </div>
                              <div className="divide-y divide-line border border-line rounded-2xl px-3.5 bg-white">
                                {PERMISSION_KEYS.map((key) => {
                                  const meta = PERMISSION_META[key];
                                  const checked = !!permDraft[key];
                                  return (
                                    <div key={key} className="py-3 flex items-start justify-between gap-3">
                                      <div className="flex flex-col gap-0.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-[14px] font-semibold text-ink">
                                            {meta.label}
                                          </span>
                                          {meta.routes.map((rt) => (
                                            <code
                                              key={rt}
                                              className="text-[11px] px-1.5 py-0.5 rounded bg-soft border border-line text-ink-mute"
                                            >
                                              {rt}
                                            </code>
                                          ))}
                                        </div>
                                        <span className="text-[12.5px] text-ink-mute">{meta.description}</span>
                                      </div>
                                      <Toggle
                                        checked={checked}
                                        onChange={(val) => setPermDraft((p) => ({ ...p, [key]: val }))}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col gap-3.5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                              <div>
                                <label className="jw-lbl">ชื่อ-นามสกุล</label>
                                <input
                                  type="text"
                                  value={nameDraft}
                                  onChange={(e) => setNameDraft(e.target.value)}
                                  placeholder="ชื่อ-นามสกุล"
                                  className="jw-in"
                                />
                              </div>
                              <div>
                                <label className="jw-lbl">ชื่อเล่น / ชื่อเรียก</label>
                                <input
                                  type="text"
                                  value={nicknameDraft}
                                  onChange={(e) => setNicknameDraft(e.target.value)}
                                  placeholder="ชื่อเล่น"
                                  className="jw-in"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                              <div>
                                <label className="jw-lbl">หน่วยงาน / ชุมชน / สังกัด</label>
                                <input
                                  type="text"
                                  value={departmentDraft}
                                  onChange={(e) => setDepartmentDraft(e.target.value)}
                                  placeholder="เช่น สำนักปลัด อบต., กองสวัสดิการสังคม"
                                  className="jw-in"
                                />
                              </div>
                              <div>
                                <label className="jw-lbl">เบอร์โทรศัพท์</label>
                                <input
                                  type="text"
                                  value={phoneDraft}
                                  onChange={(e) => setPhoneDraft(e.target.value)}
                                  placeholder="เช่น 081-234-5678"
                                  className="jw-in"
                                />
                              </div>
                            </div>

                            <div className="border-t border-line pt-3">
                              <label className="jw-lbl">
                                ตั้งรหัสผ่านใหม่ (Password) ·{' '}
                                <span className="font-normal text-ink-mute">
                                  เว้นว่างไว้หากไม่ต้องการเปลี่ยนรหัสผ่านของบัญชีนี้
                                </span>
                              </label>
                              <input
                                type="password"
                                value={newPasswordDraft}
                                onChange={(e) => setNewPasswordDraft(e.target.value)}
                                placeholder="กรอกรหัสผ่านใหม่สำหรับบัญชีนี้ (อย่างน้อย 4 ตัวอักษร)"
                                className="jw-in"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {errorMsg && (
              <div className="rounded-2xl bg-[#FDE8E8] border border-[#f9b4b4] px-4 py-2.5 text-[14px] text-[#7a1010] font-semibold">
                {errorMsg}
              </div>
            )}

            {savedMsg && (
              <div className="rounded-2xl bg-brand-mint border border-brand px-4 py-2.5 text-[14px] text-brand font-semibold">
                {savedMsg}
              </div>
            )}

            {/* กำหนดผู้อนุมัติในแต่ละลำดับของสายอนุมัติ (6.3.2) */}
            <div className="jw-card p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <b className="text-[16px] text-ink block">สายอนุมัติ 3 ลำดับ (ผู้รับผิดชอบปัจจุบัน)</b>
                  <span className="text-[12.5px] text-ink-mute">
                    กำหนดโดยการเลือกบทบาทของบัญชีด้านบนให้เป็น เจ้าหน้าที่ตรวจสอบ, ปลัดองค์การบริหารส่วนตำบล หรือ นายกองค์การบริหารส่วนตำบล
                  </span>
                </div>
                <Chip tone="green">3 ลำดับ</Chip>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[13px]">
                <div className="border border-line rounded-2xl p-3 bg-white">
                  <span className="text-[11px] font-bold text-brand block">ลำดับที่ 1 · เจ้าหน้าที่ตรวจสอบ</span>
                  <b className="text-[14px] text-ink block mt-0.5">
                    {users.filter((u) => u.role === 'STAFF' && u.active !== false).map((u) => u.name).join(', ') || '-'}
                  </b>
                  <span className="text-[12px] text-ink-mute">ตรวจเอกสาร + ลงนามระดับ 1</span>
                </div>
                <div className="border border-line rounded-2xl p-3 bg-white">
                  <span className="text-[11px] font-bold text-brand block">ลำดับที่ 2 · ปลัดองค์การบริหารส่วนตำบล</span>
                  <b className="text-[14px] text-ink block mt-0.5">
                    {users.filter((u) => u.role === 'APPROVER_L2' && u.active !== false).map((u) => u.name).join(', ') || '-'}
                  </b>
                  <span className="text-[12px] text-ink-mute">กลั่นกรองเห็นชอบ + ยืนยัน PIN 6 หลัก</span>
                </div>
                <div className="border border-line rounded-2xl p-3 bg-white">
                  <span className="text-[11px] font-bold text-brand block">ลำดับที่ 3 · นายกองค์การบริหารส่วนตำบล</span>
                  <b className="text-[14px] text-ink block mt-0.5">
                    {users.filter((u) => u.role === 'APPROVER_L1' && u.active !== false).map((u) => u.name).join(', ') || '-'}
                  </b>
                  <span className="text-[12px] text-ink-mute">อนุมัติขั้นสุดท้าย + ออกใบอนุญาต PDF</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* มุมมองที่ 2: ตารางโครงสร้างสิทธิ์ 5 บทบาท & ลำดับการลงนาม 3 ระดับ */
          <div className="flex flex-col gap-5">
            {/* ลำดับอำนาจการลงนาม 3 ระดับ */}
            <div className="jw-card p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <b className="text-[16px] text-ink">
                  ลำดับอำนาจการตรวจสอบและลงนามอนุมัติ 3 ระดับ (สำหรับจองสถานที่ & ยืมครุภัณฑ์)
                </b>
                <Chip tone="green">Workflow มาตรฐาน อบต.</Chip>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
                <div className="rounded-2xl border border-line bg-soft p-3.5 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <b className="text-brand">ระดับที่ 1 · เจ้าหน้าที่ตรวจสอบ</b>
                    <Chip tone="blue">STAFF</Chip>
                  </div>
                  <span className="text-ink font-semibold">สุดา มีสุข (เจ้าหน้าที่ธุรการ)</span>
                  <span className="text-ink-mute">
                    ตรวจสอบเอกสารแนบ/วันว่าง ลงนามระดับเจ้าหน้าที่เพื่อสร้างเอกสารส่งต่อ หรือส่งคืนให้แก้ไข
                  </span>
                  <span className="text-[11.5px] text-ink-mute mt-1">
                    สถานะคำขอ: <code>pending_staff</code> → <code>pending_l2</code>
                  </span>
                </div>

                <div className="rounded-2xl border border-line bg-soft p-3.5 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <b className="text-brand">ระดับที่ 2 · เห็นชอบ</b>
                    <Chip tone="amber">APPROVER_L2</Chip>
                  </div>
                  <span className="text-ink font-semibold">วิชัย รักถิ่น (ปลัด อบต.)</span>
                  <span className="text-ink-mute">
                    กลั่นกรองและลงนาม &ldquo;เห็นชอบ&rdquo; ด้วยลายเซ็นดิจิทัล + ยืนยันรหัส PIN 6 หลัก
                  </span>
                  <span className="text-[11.5px] text-ink-mute mt-1">
                    สถานะคำขอ: <code>pending_l2</code> → <code>pending_l1</code>
                  </span>
                </div>

                <div className="rounded-2xl border border-line bg-soft p-3.5 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <b className="text-brand">ระดับที่ 3 · อนุมัติขั้นสุดท้าย</b>
                    <Chip tone="amber">APPROVER_L1</Chip>
                  </div>
                  <span className="text-ink font-semibold">ประเสริฐ ศรีสุข (นายก อบต.)</span>
                  <span className="text-ink-mute">
                    ลงนาม &ldquo;อนุมัติ&rdquo; ขั้นสุดท้ายด้วยลายเซ็นดิจิทัล + PIN 6 หลัก และออกใบอนุญาต PDF อัตโนมัติ
                  </span>
                  <span className="text-[11.5px] text-ink-mute mt-1">
                    สถานะคำขอ: <code>pending_l1</code> → <code>approved / borrowing</code>
                  </span>
                </div>
              </div>
            </div>

            {/* ตารางเปรียบเทียบสิทธิ์ 5 บทบาท */}
            <div className="jw-card p-5 overflow-x-auto">
              <b className="text-[16px] text-ink block mb-3">
                ตารางเปรียบเทียบสิทธิ์มาตรฐานทั้ง 5 บทบาท (Role & Permission Matrix)
              </b>
              <table className="w-full text-[13px] border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b border-line text-left bg-soft">
                    <th className="p-2.5 font-bold text-ink">สิทธิ์การใช้งาน / เมนู</th>
                    {ROLES.map((r) => (
                      <th key={r} className="p-2.5 text-center font-bold">
                        <Chip tone={ROLE_TONE[r]}>{ROLE_META[r].shortLabel}</Chip>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <tr>
                    <td className="p-2.5">
                      <b className="block">ยื่นคำขอจอง / ยืม–คืน / แจ้งซ่อม / ติดตามผล</b>
                      <span className="text-[11.5px] text-ink-mute">/, /booking, /borrow, /repair</span>
                    </td>
                    {ROLES.map((r) => (
                      <td key={r} className="p-2.5 text-center text-brand font-bold">
                        ✓
                      </td>
                    ))}
                  </tr>
                  {PERMISSION_KEYS.map((perm) => {
                    const meta = PERMISSION_META[perm];
                    return (
                      <tr key={perm}>
                        <td className="p-2.5">
                          <b className="block">{meta.label}</b>
                          <span className="text-[11.5px] text-ink-mute">{meta.routes.join(', ')}</span>
                        </td>
                        {ROLES.map((r) => {
                          const has = DEFAULT_PERMISSIONS[r][perm];
                          return (
                            <td
                              key={r}
                              className={`p-2.5 text-center font-bold ${
                                has ? 'text-brand' : 'text-ink-ph'
                              }`}
                            >
                              {has ? '✓' : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* รายละเอียดขอบเขตหน้าที่ของแต่ละบทบาท */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {ROLES.map((r) => {
                const info = ROLE_META[r];
                return (
                  <div key={r} className="jw-card p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-[15px] text-ink">{info.label}</b>
                      <Chip tone={info.tone}>{info.shortLabel}</Chip>
                    </div>
                    <p className="text-[12.5px] text-ink-mute">{info.summary}</p>
                    <ul className="text-[12.5px] text-ink space-y-1 pl-4 list-disc">
                      {info.capabilities.map((cap) => (
                        <li key={cap}>{cap}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
