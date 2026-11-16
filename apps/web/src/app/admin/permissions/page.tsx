'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  PublicAccount,
  Role,
  RoleItem,
  Tone,
} from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import { Icon } from '@/components/icons';
import { Toggle } from '@/components/ui';
import { api } from '@/lib/api';

const TONE_STYLES: Record<
  string,
  { dot: string; badge: string }
> = {
  green: {
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  blue: {
    dot: 'bg-blue-500',
    badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  },
  amber: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  purple: {
    dot: 'bg-purple-500',
    badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  },
  teal: {
    dot: 'bg-teal-500',
    badge: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30',
  },
  red: {
    dot: 'bg-rose-500',
    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  },
  orange: {
    dot: 'bg-orange-500',
    badge: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  },
  gray: {
    dot: 'bg-slate-500',
    badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  },
};

function getToneStyle(tone?: Tone | string) {
  return TONE_STYLES[tone || 'blue'] || TONE_STYLES.blue;
}

const ROLE_ORDER: string[] = [
  'USER',
  'STAFF',
  'APPROVER_L1',
  'APPROVER_L2',
  'ADMIN',
];

/**
 * หน้าจอกำหนดบทบาทผู้ใช้งาน (Role Assignment)
 * โครงสร้างแบบ 2-Column Split-Pane ภายใน AppShell (มี Sidebar เมนูระบบครบชุด)
 */
export default function AdminPermissionsPage() {
  const { account: currentAccount, refreshMe } = useAuth();

  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [users, setUsers] = useState<PublicAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeFilter, setActiveFilter] = useState<string>('all'); // 'all' | 'suspended' | roleKey
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkTargetRole, setBulkTargetRole] = useState<string>('');
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [openPopoverUserId, setOpenPopoverUserId] = useState<string | null>(null);

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg('');
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg('');
    setTimeout(() => setErrorMsg(''), 4500);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [roleList, userList] = await Promise.all([
        api.getRoles(),
        api.users(),
      ]);
      setRoles(roleList);
      setUsers(userList);
    } catch (err: any) {
      showError(err.message || 'ไม่สามารถโหลดข้อมูลผู้ใช้งานและบทบาทได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-role-popover]')) return;
      setOpenPopoverUserId(null);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const notifyNavigationChange = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('japjong-navigation-refresh'));
    }
    refreshMe();
  };

  const handleAssignSingleUserRole = async (user: PublicAccount, newRole: Role) => {
    setOpenPopoverUserId(null);
    if (user.role === newRole) return;
    if (user.id === currentAccount?.id && currentAccount?.role === 'ADMIN' && newRole !== 'ADMIN') {
      showError('ไม่สามารถลดระดับบทบาทของตนเองได้');
      return;
    }

    try {
      await api.updatePermissions(user.id, { role: newRole });
      const roleObj = roles.find((r) => r.key === newRole);
      showSuccess(`เปลี่ยนบทบาทของ ${user.name} เป็น "${roleObj?.name || newRole}" สำเร็จ`);
      await loadData();
      notifyNavigationChange();
    } catch (err: any) {
      showError(err.message || 'ไม่สามารถเปลี่ยนบทบาทได้');
    }
  };

  const handleToggleUserActive = async (user: PublicAccount) => {
    if (user.id === currentAccount?.id) {
      showError('ไม่สามารถระงับการใช้งานบัญชีของตนเองได้');
      return;
    }
    const nextActive = user.active === false;
    try {
      await api.updatePermissions(user.id, { active: nextActive });
      showSuccess(`${nextActive ? 'เปิด' : 'ระงับ'}การใช้งานบัญชี ${user.name} แล้ว`);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'ไม่สามารถเปลี่ยนสถานะบัญชีได้');
    }
  };

  const handleBulkAssign = async () => {
    if (selectedUserIds.length === 0) {
      showError('กรุณาเลือกผู้ใช้งานอย่างน้อย 1 คน');
      return;
    }
    if (!bulkTargetRole) {
      showError('กรุณาเลือกบทบาทเป้าหมาย');
      return;
    }

    try {
      setIsBulkAssigning(true);
      const res = await api.bulkAssignRole(selectedUserIds, bulkTargetRole as Role);
      if (res.errors && res.errors.length > 0) {
        showError(`เปลี่ยนบทบาทสำเร็จ ${res.updatedCount} คน (มีข้อผิดพลาด: ${res.errors.join(', ')})`);
      } else {
        const roleObj = roles.find((r) => r.key === bulkTargetRole);
        showSuccess(`เปลี่ยนบทบาทให้ผู้ใช้งาน ${res.updatedCount} คนเป็น "${roleObj?.name || bulkTargetRole}" เรียบร้อยแล้ว`);
      }
      setSelectedUserIds([]);
      setBulkTargetRole('');
      await loadData();
      notifyNavigationChange();
    } catch (err: any) {
      showError(err.message || 'ไม่สามารถกำหนดบทบาทกลุ่มได้');
    } finally {
      setIsBulkAssigning(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (activeFilter === 'suspended' && u.active !== false) return false;
      if (activeFilter !== 'all' && activeFilter !== 'suspended' && u.role !== activeFilter) {
        return false;
      }
      if (userSearch.trim()) {
        const q = userSearch.toLowerCase();
        return (
          u.name.toLowerCase().includes(q) ||
          u.phone.includes(q) ||
          u.username.toLowerCase().includes(q) ||
          (u.position && u.position.toLowerCase().includes(q)) ||
          (u.department && u.department.toLowerCase().includes(q)) ||
          (u.nickname && u.nickname.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [users, activeFilter, userSearch]);

  const suspendedCount = useMemo(
    () => users.filter((u) => u.active === false).length,
    [users],
  );

  const isAllFilteredSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((u) => selectedUserIds.includes(u.id));

  const handleSelectAllFiltered = () => {
    const allIds = filteredUsers.map((u) => u.id);
    if (isAllFilteredSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !allIds.includes(id)));
    } else {
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...allIds])));
    }
  };

  const handleToggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const sortedRoles = useMemo(() => {
    return [...roles].sort((a, b) => {
      const idxA = ROLE_ORDER.indexOf(a.key);
      const idxB = ROLE_ORDER.indexOf(b.key);
      const rankA = idxA === -1 ? ROLE_ORDER.length : idxA;
      const rankB = idxB === -1 ? ROLE_ORDER.length : idxB;
      return rankA - rankB;
    });
  }, [roles]);

  const selectedRoleContext = useMemo(
    () => sortedRoles.find((r) => r.key === activeFilter),
    [sortedRoles, activeFilter],
  );

  return (
    <AppShell
      title="กำหนดบทบาทผู้ใช้งาน"
      backHref="/admin"
      rightLabel="แอดมิน"
      maxWidth="max-w-[1160px]"
    >
      <div className="flex flex-col gap-4 pb-20">
        {/* Feedback Notification */}
        {successMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2.5 animate-fadeIn">
            <Icon name="check" className="w-5 h-5 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2.5 animate-fadeIn">
            <Icon name="alert-triangle" className="w-5 h-5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 2-Column Split Workspace */}
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* LEFT PANE: Role Directory & Context */}
          <aside className="w-full lg:w-72 shrink-0 flex flex-col gap-4 lg:sticky lg:top-20">
            <div className="jw-card p-3 flex flex-col gap-1">
              <div className="px-2.5 py-1.5 text-xs font-bold text-ink-mute uppercase tracking-wide">
                กลุ่มบทบาทในระบบ
              </div>

              <div className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
                {/* ผู้ใช้งานทั้งหมด */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveFilter('all');
                    setOpenPopoverUserId(null);
                  }}
                  className={`shrink-0 lg:w-full px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-left transition cursor-pointer ${
                    activeFilter === 'all'
                      ? 'bg-brand-mint text-brand font-bold'
                      : 'hover:bg-soft text-ink font-medium'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-emerald-500" />
                    <span className="text-xs sm:text-sm truncate">ผู้ใช้งานทั้งหมด</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      activeFilter === 'all'
                        ? 'bg-brand text-white'
                        : 'bg-soft text-ink-mute'
                    }`}
                  >
                    {users.length}
                  </span>
                </button>

                {/* รายการบทบาทในระบบ */}
                {sortedRoles.map((r) => {
                  const isActive = activeFilter === r.key;
                  const tone = getToneStyle(r.tone);
                  const count = users.filter((u) => u.role === r.key).length;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setActiveFilter(r.key);
                        setOpenPopoverUserId(null);
                      }}
                      className={`shrink-0 lg:w-full px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-left transition cursor-pointer ${
                        isActive
                          ? 'bg-brand-mint text-brand font-bold'
                          : 'hover:bg-soft text-ink font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tone.dot}`} />
                        <span className="text-xs sm:text-sm truncate">{r.name}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          isActive ? 'bg-brand text-white' : 'bg-soft text-ink-mute'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}

                <div className="hidden lg:block my-1 border-t border-line" />

                {/* บัญชีที่ถูกระงับ */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveFilter('suspended');
                    setOpenPopoverUserId(null);
                  }}
                  className={`shrink-0 lg:w-full px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-left transition cursor-pointer ${
                    activeFilter === 'suspended'
                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold'
                      : 'hover:bg-soft text-ink font-medium'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-rose-500" />
                    <span className="text-xs sm:text-sm truncate">บัญชีที่ถูกระงับ</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      activeFilter === 'suspended'
                        ? 'bg-rose-600 text-white'
                        : 'bg-soft text-ink-mute'
                    }`}
                  >
                    {suspendedCount}
                  </span>
                </button>
              </div>
            </div>

            {/* Role Context Card (Desktop) */}
            <div className="hidden lg:flex jw-card p-4 flex-col gap-2">
              {selectedRoleContext ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-ink-mute">ขอบเขตบทบาท</span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                        getToneStyle(selectedRoleContext.tone).badge
                      }`}
                    >
                      {selectedRoleContext.key}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-ink">{selectedRoleContext.name}</div>
                  <p className="text-xs text-ink-mute leading-relaxed">
                    {selectedRoleContext.description || 'ไม่มีคำอธิบายเพิ่มเติม'}
                  </p>
                </>
              ) : activeFilter === 'suspended' ? (
                <>
                  <div className="text-xs font-bold text-rose-600 dark:text-rose-400">
                    บัญชีที่ถูกระงับ
                  </div>
                  <p className="text-xs text-ink-mute leading-relaxed">
                    ผู้ใช้งานกลุ่มนี้ไม่สามารถเข้าสู่ระบบได้จนกว่าผู้ดูแลระบบจะเปิดใช้งานอีกครั้ง
                  </p>
                </>
              ) : (
                <>
                  <div className="text-xs font-bold text-ink-mute">คำแนะนำการใช้งาน</div>
                  <p className="text-xs text-ink-mute leading-relaxed">
                    คลิกที่ป้ายบทบาทด้านขวาของแต่ละรายชื่อเพื่อเปลี่ยนบทบาทได้ทันที
                    หรือติ๊กเลือกหลายคนเพื่อเปลี่ยนพร้อมกัน
                  </p>
                </>
              )}
            </div>
          </aside>

          {/* RIGHT PANE: User Directory & Quick Role Picker */}
          <section className="flex-1 w-full min-w-0 flex flex-col gap-3">
            {/* Search & Select All Toolbar */}
            <div className="jw-card p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-ph">
                  <Icon name="search" className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ, ตำแหน่ง, สังกัด, เบอร์โทร, @username..."
                  className="jw-in pl-10 h-10 w-full rounded-xl text-sm"
                />
              </div>

              <label className="flex items-center gap-2 px-2 text-xs font-semibold text-ink cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={isAllFilteredSelected}
                  onChange={handleSelectAllFiltered}
                  className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                />
                <span>เลือกทั้งหมด ({filteredUsers.length})</span>
              </label>
            </div>

            {/* User List */}
            {loading ? (
              <div className="jw-card p-12 text-center text-sm text-ink-mute">
                กำลังโหลดรายชื่อผู้ใช้งาน...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="jw-card p-12 text-center text-sm text-ink-mute">
                ไม่พบผู้ใช้งานในหมวดหมู่นี้
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredUsers.map((user) => {
                  const isSelected = selectedUserIds.includes(user.id);
                  const isSelf = user.id === currentAccount?.id;
                  const roleObj = roles.find((r) => r.key === user.role);
                  const tone = getToneStyle(roleObj?.tone);
                  const isPopoverOpen = openPopoverUserId === user.id;
                  const isLockedSelfAdmin = isSelf && user.role === 'ADMIN';

                  return (
                    <div
                      key={user.id}
                      className={`jw-card relative p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition border ${
                        isPopoverOpen ? 'z-30' : ''
                      } ${
                        isSelected
                          ? 'border-brand bg-brand-mint/20'
                          : user.active === false
                          ? 'border-line/60 opacity-75'
                          : 'border-line hover:border-brand/40'
                      }`}
                    >
                      {/* Left: Checkbox + Avatar + Identity */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectUser(user.id)}
                          className="w-4 h-4 rounded accent-emerald-600 cursor-pointer mt-1 sm:mt-0 shrink-0"
                        />

                        <div className="w-10 h-10 rounded-full bg-soft text-brand font-bold text-sm flex items-center justify-center shrink-0 border border-line">
                          {user.initial || user.name.charAt(0) || 'ผ'}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-ink truncate">
                              {user.name}
                            </span>
                            {user.nickname && (
                              <span className="text-xs text-ink-mute">
                                ({user.nickname})
                              </span>
                            )}
                            {isSelf && (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-mint text-brand border border-brand/30">
                                บัญชีของคุณ
                              </span>
                            )}
                            {user.active === false && (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
                                ระงับบัญชี
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-ink-mute mt-0.5 truncate">
                            {user.position || 'ตำแหน่งไม่ระบุ'} ·{' '}
                            {user.department || 'หน่วยงานไม่ระบุ'} ·{' '}
                            {user.phone || '-'} (@{user.username})
                          </div>
                        </div>
                      </div>

                      {/* Right: Clickable Role Pill Popover + Account Toggle */}
                      <div className="flex items-center justify-end gap-3 pl-7 sm:pl-0 shrink-0">
                        <div className="relative" data-role-popover>
                          <button
                            type="button"
                            disabled={isLockedSelfAdmin}
                            onClick={() => {
                              setOpenPopoverUserId(isPopoverOpen ? null : user.id);
                            }}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                              tone.badge
                            } ${
                              isLockedSelfAdmin
                                ? 'opacity-75 cursor-not-allowed'
                                : 'hover:opacity-85 cursor-pointer'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
                            <span>{roleObj?.name || user.role}</span>
                            {!isLockedSelfAdmin && (
                              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                            )}
                          </button>

                          {isPopoverOpen && (
                            <div
                              className="absolute right-0 mt-1.5 w-60 p-1.5 rounded-2xl bg-surface border border-line shadow-xl z-40 flex flex-col gap-1 animate-fadeIn"
                            >
                              <div className="px-2.5 py-1 text-xs font-bold text-ink-mute">
                                เลือกบทบาทใหม่
                              </div>
                              {sortedRoles
                                .filter((r) => r.enabled || r.key === user.role)
                                .map((r) => {
                                  const rTone = getToneStyle(r.tone);
                                  const isCurrent = user.role === r.key;
                                  return (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onClick={() =>
                                        handleAssignSingleUserRole(user, r.key as Role)
                                      }
                                      className={`w-full px-2.5 py-2 rounded-xl text-left text-xs font-semibold flex items-center justify-between gap-2 transition cursor-pointer ${
                                        isCurrent
                                          ? 'bg-brand-mint text-brand'
                                          : 'hover:bg-soft text-ink'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span
                                          className={`w-2 h-2 rounded-full shrink-0 ${rTone.dot}`}
                                        />
                                        <span className="truncate">{r.name}</span>
                                      </div>
                                      {isCurrent && (
                                        <Icon name="check" className="w-4 h-4 text-brand shrink-0" />
                                      )}
                                    </button>
                                  );
                                })}
                            </div>
                          )}
                        </div>

                        <div className="pl-2 border-l border-line">
                          <Toggle
                            checked={user.active !== false}
                            onChange={() => handleToggleUserActive(user)}
                            disabled={isSelf}
                            title={isSelf ? 'ไม่สามารถระงับบัญชีตนเองได้' : 'เปิด/ระงับบัญชี'}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Floating Bottom Bulk Action Dock */}
        {selectedUserIds.length > 0 && (
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-xl p-3 rounded-2xl bg-surface border-2 border-brand shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">
                {selectedUserIds.length}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-ink leading-tight">
                  เลือกแล้ว {selectedUserIds.length} คน
                </span>
                <span className="text-xs text-ink-mute">
                  เลือกบทบาทใหม่เพื่อเปลี่ยนพร้อมกัน
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <select
                value={bulkTargetRole}
                onChange={(e) => setBulkTargetRole(e.target.value)}
                className="jw-in h-9 rounded-xl text-xs font-semibold border-line py-0 px-3"
              >
                <option value="">-- เลือกบทบาท --</option>
                {sortedRoles
                  .filter((r) => r.enabled)
                  .map((r) => (
                    <option key={r.id} value={r.key}>
                      {r.name} ({r.key})
                    </option>
                  ))}
              </select>

              <button
                type="button"
                onClick={handleBulkAssign}
                disabled={isBulkAssigning || !bulkTargetRole}
                className="jw-btn h-9 px-4 text-xs font-bold"
              >
                {isBulkAssigning ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedUserIds([]);
                  setBulkTargetRole('');
                }}
                className="jw-btn-sec h-9 px-3 text-xs font-semibold"
              >
                ล้าง
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
