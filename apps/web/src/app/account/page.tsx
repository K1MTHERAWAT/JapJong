'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  PenTool,
  Phone,
  UserCircle,
  AlertCircle,
} from 'lucide-react';
import {
  LineAuthStatusResponse,
  ROLE_LABEL,
  ROLE_TONE,
  sanitizePhoneInput,
  validateThaiAddressHierarchy,
  validateThaiPhone,
} from '@japjong/shared';
import { useAuth } from '@/components/auth-context';
import { AppShell } from '@/components/shell';
import {
  Phone10DigitInput,
  ThaiAddressSelect,
} from '@/components/thai-address-select';
import {
  Button,
  Card,
  Chip,
  Input,
  PinKeypad,
  SignatureBox,
  SignOtpVerifier,
  Tabs,
} from '@/components/ui';
import { api, formatThaiDate } from '@/lib/api';

type AccountTab = 'profile' | 'password' | 'signature';

function LineIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.365 9.863c.349.002.63.285.63.631 0 .348-.281.63-.63.63h-2.12v1.341h2.12c.349 0 .63.283.63.631 0 .348-.281.63-.63.63h-2.752a.63.63 0 0 1-.63-.63V7.868c0-.348.281-.63.63-.63h2.752c.349 0 .63.282.63.63 0 .348-.281.63-.63.63h-2.12v1.365h2.12zm-4.704 3.232c0 .348-.282.63-.63.63a.628.628 0 0 1-.504-.254l-2.023-2.775v2.4c0 .347-.282.629-.63.629a.63.63 0 0 1-.631-.63V7.868c0-.348.282-.63.631-.63a.63.63 0 0 1 .504.254l2.023 2.776V7.868c0-.348.281-.63.63-.63.348 0 .63.282.63.63v5.227zm-5.864 0c0 .348-.282.63-.63.63a.63.63 0 0 1-.631-.63V7.868c0-.348.282-.63.631-.63.348 0 .63.282.63.63v5.227zM6.55 10.494h-2.12v2.601c0 .348-.282.63-.63.63a.63.63 0 0 1-.63-.63V7.868c0-.348.281-.63.63-.63.348 0 .63.282.63.63v2.626h2.12c.349 0 .63.282.63.63 0 .348-.281.63-.63.63zM12 2C6.477 2 2 5.925 2 10.767c0 4.398 3.668 8.082 8.618 8.683.336.073.792.222.908.51.104.258.068.663.033.924l-.145.875c-.044.267-.206 1.043.914.569 1.12-.474 6.046-3.56 8.249-6.096C21.65 14.07 22 12.482 22 10.767 22 5.925 17.523 2 12 2z" />
    </svg>
  );
}

export default function AccountPage() {
  const { account, refreshMe } = useAuth();
  const [activeTab, setActiveTab] = useState<AccountTab>('profile');

  // Profile state
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressHouseNo, setAddressHouseNo] = useState('');
  const [addressMoo, setAddressMoo] = useState('');
  const [addressProvinceId, setAddressProvinceId] = useState('');
  const [addressDistrictId, setAddressDistrictId] = useState('');
  const [addressSubdistrictId, setAddressSubdistrictId] = useState('');
  const [addressSubdistrict, setAddressSubdistrict] = useState('');
  const [addressDistrict, setAddressDistrict] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  // Signature & PIN state
  const [signature, setSignature] = useState('');
  const [pin, setPin] = useState('');
  const [savingSig, setSavingSig] = useState(false);
  const [sigMsg, setSigMsg] = useState('');
  const [sigErr, setSigErr] = useState('');

  // LINE link state
  const [lineStatus, setLineStatus] = useState<LineAuthStatusResponse | null>(null);
  const [linkingLine, setLinkingLine] = useState(false);

  useEffect(() => {
    api.getLineStatus().then(setLineStatus).catch(() => {});
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('line_linked') === '1') {
        setProfileMsg('เชื่อมต่อบัญชี LINE เรียบร้อยแล้ว');
        refreshMe();
        window.history.replaceState({}, '', '/account');
      } else if (sp.get('line_error')) {
        setProfileErr(decodeURIComponent(sp.get('line_error') || 'เชื่อมต่อ LINE ไม่สำเร็จ'));
        window.history.replaceState({}, '', '/account');
      }
    }
  }, [refreshMe]);

  const handleLinkLine = async () => {
    setLinkingLine(true);
    setProfileErr('');
    try {
      const res = await api.getLineLinkUrl();
      if (res.url) {
        window.location.href = res.url;
        return;
      }
    } catch {
      if (account?.id) {
        window.location.href = `/api/auth/line?linkUserId=${encodeURIComponent(account.id)}`;
        return;
      }
    }
    setLinkingLine(false);
  };

  const handleUnlinkLine = async () => {
    setLinkingLine(true);
    setProfileErr('');
    try {
      await api.unlinkLine();
      const updated = await api.getLineStatus().catch(() => ({ isLinked: false, lineAccount: null }));
      setLineStatus(updated);
      await refreshMe();
      setProfileMsg('ยกเลิกการเชื่อมต่อบัญชี LINE เรียบร้อยแล้ว');
      setTimeout(() => setProfileMsg(''), 3500);
    } catch (err) {
      setProfileErr((err as Error).message || 'ไม่สามารถยกเลิกการเชื่อมต่อ LINE ได้');
    } finally {
      setLinkingLine(false);
    }
  };

  useEffect(() => {
    if (account) {
      setName(account.name || '');
      setNickname(account.nickname || '');
      setDepartment(account.department || '');
      setPhone(sanitizePhoneInput(account.phone || ''));
      setEmail(account.email || '');
      setAddressHouseNo(account.addressHouseNo || '');
      setAddressMoo(account.addressMoo || '');
      setAddressProvinceId(account.addressProvinceId || '');
      setAddressDistrictId(account.addressDistrictId || '');
      setAddressSubdistrictId(account.addressSubdistrictId || '');
      setAddressSubdistrict(account.addressSubdistrict || '');
      setAddressDistrict(account.addressDistrict || '');
      setAddressProvince(account.addressProvince || '');
      setSignature(account.signature || '');
    }
  }, [account]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileErr('');
    if (!name.trim()) {
      setProfileErr('กรุณากรอกชื่อ-นามสกุล');
      return;
    }
    if (!department.trim()) {
      setProfileErr('กรุณาระบุหน่วยงาน / ชุมชน / สังกัด');
      return;
    }
    const phoneCheck = validateThaiPhone(phone);
    if (!phoneCheck.valid) {
      setProfileErr(phoneCheck.error || 'กรุณากรอกเบอร์โทรศัพท์เป็นตัวเลข 10 หลัก');
      return;
    }
    if (
      addressProvinceId ||
      addressDistrictId ||
      addressSubdistrictId ||
      addressProvince ||
      addressDistrict ||
      addressSubdistrict
    ) {
      const addrCheck = validateThaiAddressHierarchy({
        provinceId: addressProvinceId,
        districtId: addressDistrictId,
        subdistrictId: addressSubdistrictId,
        provinceName: addressProvince,
        districtName: addressDistrict,
        subdistrictName: addressSubdistrict,
      });
      if (!addrCheck.valid) {
        setProfileErr(addrCheck.error || 'ข้อมูลที่อยู่ไม่ครบถ้วน');
        return;
      }
    }

    setSavingProfile(true);
    try {
      await api.updateProfile({
        name: name.trim(),
        nickname: nickname.trim(),
        department: department.trim(),
        phone: phoneCheck.normalized,
        email: email.trim(),
        addressHouseNo: addressHouseNo.trim(),
        addressMoo: addressMoo.trim(),
        addressProvinceId: addressProvinceId || undefined,
        addressDistrictId: addressDistrictId || undefined,
        addressSubdistrictId: addressSubdistrictId || undefined,
        addressSubdistrict: addressSubdistrict.trim(),
        addressDistrict: addressDistrict.trim(),
        addressProvince: addressProvince.trim(),
      });
      await refreshMe();
      setProfileMsg('บันทึกข้อมูลบัญชีและโปรไฟล์เรียบร้อยแล้ว');
      setTimeout(() => setProfileMsg(''), 3500);
    } catch (err) {
      setProfileErr((err as Error).message || 'ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleResetProfileForm = () => {
    if (!account) return;
    setName(account.name || '');
    setNickname(account.nickname || '');
    setDepartment(account.department || '');
    setPhone(sanitizePhoneInput(account.phone || ''));
    setAddressHouseNo(account.addressHouseNo || '');
    setAddressMoo(account.addressMoo || '');
    setAddressProvinceId(account.addressProvinceId || '');
    setAddressDistrictId(account.addressDistrictId || '');
    setAddressSubdistrictId(account.addressSubdistrictId || '');
    setAddressSubdistrict(account.addressSubdistrict || '');
    setAddressDistrict(account.addressDistrict || '');
    setAddressProvince(account.addressProvince || '');
    setProfileErr('');
    setProfileMsg('');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg('');
    setPwdErr('');
    if (!currentPassword) {
      setPwdErr('กรุณากรอกรหัสผ่านปัจจุบัน');
      return;
    }
    if (!newPassword) {
      setPwdErr('กรุณากรอกรหัสผ่านใหม่');
      return;
    }
    if (newPassword.length < 4) {
      setPwdErr('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdErr('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setSavingPwd(true);
    try {
      await api.changePassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdMsg('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
      setTimeout(() => setPwdMsg(''), 3500);
    } catch (err) {
      setPwdErr((err as Error).message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้');
    } finally {
      setSavingPwd(false);
    }
  };

  const handleSaveSignature = async () => {
    setSigMsg('');
    setSigErr('');
    if (!signature.trim()) {
      setSigErr('กรุณาเขียนลายมือชื่อบนกรอบด้านล่างก่อนบันทึก');
      return;
    }
    setSavingSig(true);
    try {
      await api.saveSignature(signature);
      await refreshMe();
      setSigMsg('บันทึกลายมือชื่อประจำตัวเรียบร้อยแล้ว');
      setTimeout(() => setSigMsg(''), 3500);
    } catch (err) {
      setSigErr((err as Error).message || 'ไม่สามารถบันทึกลายมือชื่อได้');
    } finally {
      setSavingSig(false);
    }
  };

  const handleSavePin = async (fullPin: string) => {
    setSigMsg('');
    setSigErr('');
    try {
      await api.savePin(fullPin);
      await refreshMe();
      setPin('');
      setSigMsg('ตั้งรหัส PIN 6 หลักสำหรับยืนยันการลงนามเรียบร้อยแล้ว');
      setTimeout(() => setSigMsg(''), 3500);
    } catch (err) {
      setPin('');
      setSigErr((err as Error).message || 'ไม่สามารถบันทึกรหัส PIN ได้');
    }
  };

  return (
    <AppShell title="จัดการบัญชีผู้ใช้งาน" maxWidth="max-w-[1440px]">
      {account && (
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 sm:gap-5">
          {/* Header Card Summary */}
          <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-6">
            <div className="flex items-center gap-4 min-w-0">
              <div className="size-14 rounded-full bg-brand-tint text-brand-ink font-bold text-title flex items-center justify-center shrink-0 border border-brand/20 sm:size-16">
                {account.initial || account.name.charAt(0) || 'ผ'}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-heading sm:text-title font-bold text-ink truncate">
                    {account.name}
                  </h1>
                  <Chip tone={ROLE_TONE[account.role]}>
                    {ROLE_LABEL[account.role]}
                  </Chip>
                </div>
                <div className="text-body text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1">
                    <UserCircle className="size-4 shrink-0" />
                    ชื่อผู้ใช้: <b className="text-ink">{account.username}</b>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="size-4 shrink-0" />
                    {account.position} · {account.department}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-4 shrink-0" />
                    {account.phone}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1 text-caption text-muted sm:shrink-0 sm:items-end">
              <span>วันที่สร้างบัญชี: {formatThaiDate(account.createdAt)}</span>
              <div className="flex items-center gap-1.5">
                <Chip tone={account.signature ? 'green' : 'gray'}>
                  {account.signature ? 'มีลายเซ็นแล้ว' : 'ยังไม่ตั้งลายเซ็น'}
                </Chip>
                <Chip tone={account.hasPin ? 'green' : 'gray'}>
                  {account.hasPin ? 'ตั้ง PIN 6 หลักแล้ว' : 'ยังไม่ตั้ง PIN'}
                </Chip>
              </div>
              <Link
                href="/notifications/settings"
                className="text-[12px] text-brand font-medium hover:underline inline-flex items-center gap-1 mt-1"
              >
                <span>ตั้งค่าการแจ้งเตือน (LINE & In-App)</span>
                <ExternalLink className="size-3" />
              </Link>
            </div>
          </Card>

          {/* Navigation Tabs */}
          <Tabs<AccountTab>
            className="flex-wrap sm:flex-nowrap"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'profile', label: 'ข้อมูลโปรไฟล์ & หน่วยงาน' },
              { value: 'password', label: 'เปลี่ยนรหัสผ่าน (Password)' },
              { value: 'signature', label: 'ลายมือชื่อ & รหัส PIN' },
            ]}
          />

          {/* TAB 1: Profile & Department */}
          {activeTab === 'profile' && (
            <Card className="p-4 sm:p-6">
              <form onSubmit={handleSaveProfile} className="flex flex-col gap-4 sm:gap-5">
                <div className="flex items-center gap-2.5 border-b border-line-soft pb-3">
                  <UserCircle className="size-5 text-brand" />
                  <div>
                    <h2 className="text-heading font-bold text-ink">
                      แก้ไขข้อมูลส่วนตัวและหน่วยงาน
                    </h2>
                    <p className="text-caption text-muted">
                      ข้อมูลนี้จะใช้แสดงผลในระบบและกรอกลงในแบบฟอร์มคำขออัตโนมัติ
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                  <Input
                    label="ชื่อ-นามสกุล *"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="เช่น สมชาย ใจดี"
                    required
                  />
                  <Input
                    label="ชื่อเล่น / ชื่อเรียก"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="เช่น สมชาย"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                  <Input
                    label="หน่วยงาน / ชุมชน / สังกัด *"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="ระบุหน่วยงาน ชุมชน หรือกลุ่มของคุณ"
                    required
                  />
                  <Phone10DigitInput
                    label="เบอร์โทรศัพท์ (ตัวเลข 10 หลัก)"
                    required
                    value={phone}
                    onChange={setPhone}
                  />
                  <Input
                    label="อีเมล (สำหรับรับรหัส OTP ยืนยันการลงนาม)"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="เช่น user@namcham.go.th"
                  />
                </div>

                {/* ที่อยู่สำหรับดึงไปกรอกคำขออัตโนมัติ */}
                <div className="pt-2 border-t border-line-soft flex flex-col gap-3">
                  <div>
                    <b className="text-body font-bold text-ink block">ที่อยู่ (สำหรับแบบคำขอราชการ)</b>
                    <span className="text-caption text-muted">
                      ข้อมูลที่อยู่นี้จะถูกดึงไปกรอกในแบบขอใช้สถานที่และขอยืมอุปกรณ์อัตโนมัติ
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input
                      label="อยู่บ้านเลขที่"
                      value={addressHouseNo}
                      onChange={(e) => setAddressHouseNo(e.target.value)}
                      placeholder="เลขที่"
                    />
                    <Input
                      label="หมู่ที่"
                      value={addressMoo}
                      onChange={(e) => setAddressMoo(e.target.value)}
                      placeholder="หมู่ที่"
                    />
                  </div>
                  <ThaiAddressSelect
                    province={addressProvince}
                    district={addressDistrict}
                    subdistrict={addressSubdistrict}
                    provinceId={addressProvinceId}
                    districtId={addressDistrictId}
                    subdistrictId={addressSubdistrictId}
                    onChange={(val) => {
                      setAddressProvinceId(val.provinceId || '');
                      setAddressDistrictId(val.districtId || '');
                      setAddressSubdistrictId(val.subdistrictId || '');
                      setAddressProvince(val.province);
                      setAddressDistrict(val.district);
                      setAddressSubdistrict(val.subdistrict);
                    }}
                  />
                </div>

                <div className="pt-2 border-t border-line-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-surface-muted p-4 border border-line">
                  <div className="flex items-center gap-3">
                    <div className="size-11 rounded-2xl bg-[#06C755]/15 text-[#06C755] flex items-center justify-center shrink-0">
                      <LineIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <b className="text-body font-bold text-ink block">การเชื่อมต่อบัญชี LINE (Link LINE)</b>
                      {lineStatus?.isLinked && lineStatus.lineAccount ? (
                        <span className="text-caption text-emerald-700 font-semibold">
                          เชื่อมต่อแล้วกับ: {lineStatus.lineAccount.displayName}
                        </span>
                      ) : (
                        <span className="text-caption text-muted">
                          เชื่อมต่อบัญชี LINE เพื่อเข้าสู่ระบบสะดวกรวดเร็วและรับแจ้งเตือนสถานะคำขอ
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={linkingLine}
                      onClick={handleLinkLine}
                      className="h-10 px-4 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-semibold text-[13.5px] inline-flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      <LineIcon className="w-4 h-4" />
                      <span>
                        {linkingLine
                          ? 'กำลังเชื่อมต่อ...'
                          : lineStatus?.isLinked
                          ? 'เปลี่ยนบัญชี LINE'
                          : 'Link LINE (เชื่อมต่อบัญชี LINE)'}
                      </span>
                    </button>
                    {lineStatus?.isLinked && (
                      <button
                        type="button"
                        disabled={linkingLine}
                        onClick={handleUnlinkLine}
                        className="h-10 px-3.5 rounded-xl border border-line bg-white hover:bg-soft text-ink-mute text-[13px] font-semibold transition disabled:opacity-50"
                      >
                        ยกเลิกเชื่อมต่อ
                      </button>
                    )}
                  </div>
                </div>

                {profileErr && (
                  <div className="rounded-control bg-danger-bg border border-danger-fg/30 px-4 py-3 text-body text-danger-fg flex items-center gap-2">
                    <AlertCircle className="size-5 shrink-0" />
                    <span>{profileErr}</span>
                  </div>
                )}

                {profileMsg && (
                  <div className="rounded-control bg-brand-tint border border-brand px-4 py-3 text-body text-brand-ink font-semibold flex items-center gap-2">
                    <CheckCircle2 className="size-5 shrink-0" />
                    <span>{profileMsg}</span>
                  </div>
                )}

                <div className="flex flex-col-reverse gap-2.5 border-t border-line-soft pt-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleResetProfileForm}
                    disabled={savingProfile}
                  >
                    คืนค่าเดิม
                  </Button>
                  <Button type="submit" variant="primary" disabled={savingProfile}>
                    {savingProfile ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* TAB 2: Change Password */}
          {activeTab === 'password' && (
            <Card className="w-full max-w-[720px] self-center p-4 sm:p-6 lg:p-7">
              <form onSubmit={handleChangePassword} className="flex flex-col gap-4 sm:gap-5">
                <div className="flex items-center gap-2.5 border-b border-line-soft pb-3">
                  <KeyRound className="size-5 text-brand" />
                  <div>
                    <h2 className="text-heading font-bold text-ink">เปลี่ยนรหัสผ่าน (Password)</h2>
                    <p className="text-caption text-muted">
                      กรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตนก่อนตั้งรหัสผ่านใหม่
                    </p>
                  </div>
                </div>

                <Input
                  type="password"
                  label="รหัสผ่านปัจจุบัน *"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านปัจจุบันของคุณ"
                  required
                />

                <Input
                  type="password"
                  label="รหัสผ่านใหม่ *"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="ตั้งรหัสผ่านใหม่อย่างน้อย 4 ตัวอักษร"
                  helperText="แนะนำให้ตั้งรหัสผ่านอย่างน้อย 8 ตัวอักษร ประกอบด้วยตัวอักษรและตัวเลข"
                  required
                />

                <Input
                  type="password"
                  label="ยืนยันรหัสผ่านใหม่ *"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                  required
                />

                {pwdErr && (
                  <div className="rounded-control bg-danger-bg border border-danger-fg/30 px-4 py-3 text-body text-danger-fg flex items-center gap-2">
                    <AlertCircle className="size-5 shrink-0" />
                    <span>{pwdErr}</span>
                  </div>
                )}

                {pwdMsg && (
                  <div className="rounded-control bg-brand-tint border border-brand px-4 py-3 text-body text-brand-ink font-semibold flex items-center gap-2">
                    <CheckCircle2 className="size-5 shrink-0" />
                    <span>{pwdMsg}</span>
                  </div>
                )}

                <div className="flex flex-col-reverse gap-2.5 border-t border-line-soft pt-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setPwdErr('');
                      setPwdMsg('');
                    }}
                    disabled={savingPwd}
                  >
                    ล้างข้อมูล
                  </Button>
                  <Button type="submit" variant="primary" disabled={savingPwd}>
                    {savingPwd ? 'กำลังเปลี่ยนรหัสผ่าน...' : 'บันทึกรหัสผ่านใหม่'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* TAB 3: Signature & PIN */}
          {activeTab === 'signature' && (
            <div className="flex flex-col gap-4 sm:gap-5">
              {/* Notice Banner */}
              <div className="rounded-control border border-line bg-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px]">
                <div className="flex items-start gap-2.5">
                  <KeyRound className="size-5 text-brand shrink-0 mt-0.5" />
                  <div>
                    <b className="text-ink font-semibold block text-[13.5px]">ระบบยืนยันตัวตน 2 ชั้นสำหรับการลงนาม (OTP + PIN)</b>
                    <span className="text-muted leading-relaxed">
                      1. ยืนยันเซสชันด้วย <b>Email OTP (Resend)</b> หนึ่งครั้งต่อการใช้งาน · 2. ยืนยันรหัส <b>PIN 6 หลัก</b> ส่วนบุคคลในแต่ละครั้งที่ลงนาม
                    </span>
                  </div>
                </div>
                {account.signature && (
                  <Chip tone="green">พร้อมลงนาม</Chip>
                )}
              </div>

              {sigMsg && (
                <div className="rounded-2xl bg-brand-mint border border-brand/30 px-4 py-2.5 text-[13px] font-semibold text-brand text-center">
                  {sigMsg}
                </div>
              )}
              {sigErr && (
                <div className="rounded-2xl bg-[#FDE8E8] border border-[#f9b4b4] px-4 py-2.5 text-[13px] text-[#7a1010] text-center">
                  {sigErr}
                </div>
              )}

              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-5">
                {/* Signature Card */}
                <Card className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
                  <div className="flex items-center gap-2.5 border-b border-line-soft pb-3">
                    <PenTool className="size-5 text-brand" />
                    <div>
                      <h2 className="text-heading font-bold text-ink">
                        1. ลายมือชื่อดิจิทัลประจำตัว
                      </h2>
                      <p className="text-caption text-muted">
                        วาดลายเซ็นเก็บไว้เพื่อนำมาใช้ประกอบการยื่นคำขอหรือลงนามอนุมัติเอกสาร
                      </p>
                    </div>
                  </div>

                  <SignatureBox
                    value={signature}
                    onChange={setSignature}
                    signerLabel={`${account.name} · ${account.position}`}
                    height={220}
                    skipPinPrompt
                  />

                  <Button
                    type="button"
                    variant="primary"
                    disabled={!signature.trim() || savingSig}
                    onClick={handleSaveSignature}
                    className="w-full"
                  >
                    {savingSig ? 'กำลังบันทึกลายเซ็น...' : 'บันทึกลายมือชื่อประจำตัว'}
                  </Button>
                </Card>

                {/* PIN & Email OTP Column */}
                <div className="flex flex-col gap-4">
                  {/* PIN 6 หลัก Card */}
                  <Card className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
                    <div className="flex items-center justify-between border-b border-line-soft pb-3">
                      <div className="flex items-center gap-2.5">
                        <KeyRound className="size-5 text-brand" />
                        <div>
                          <h2 className="text-heading font-bold text-ink">
                            2. รหัส PIN 6 หลักสำหรับการลงนาม
                          </h2>
                          <p className="text-caption text-muted">
                            ใช้ยืนยันการอนุมัติในแต่ละเอกสารร่วมกับลายเซ็นดิจิทัล
                          </p>
                        </div>
                      </div>
                      <Chip tone="green">กดเพื่อเปลี่ยน PIN</Chip>
                    </div>

                    <div className="flex flex-col items-center gap-3">
                      <PinKeypad
                        pin={pin}
                        onChange={setPin}
                        subtitle="กดตัวเลข 6 หลักเพื่อตั้งหรือเปลี่ยนรหัส PIN ประจำตัวของคุณ"
                        onComplete={handleSavePin}
                      />
                    </div>
                  </Card>

                  {/* Email OTP Sign Session Card */}
                  <Card className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
                    <div className="border-b border-line-soft pb-3">
                      <h2 className="text-heading font-bold text-ink">
                        3. เซสชัน Email OTP (Resend)
                      </h2>
                      <p className="text-caption text-muted mt-0.5">
                        ขอรหัส OTP ทางอีเมลเพื่อเปิดใช้งานเซสชันการลงนาม (มีผล 30 นาที)
                      </p>
                    </div>

                    <SignOtpVerifier initialEmail={account.email} />
                  </Card>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

