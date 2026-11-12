'use client'; // กำหนดให้คอมโพเนนต์นี้ทำงานในฝั่ง Client (React Client Component)

// นำเข้า React Hooks พื้นฐานสำหรับจัดการ State และ Side Effects
import React, { useEffect, useState } from 'react';
// นำเข้า Link สำหรับการเปลี่ยนหน้าแบบ Client-side Navigation
import Link from 'next/link';
// นำเข้าไอคอนจากไลบรารี lucide-react
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
// นำเข้า Type, ค่าคงที่ และฟังก์ชันตรวจสอบความถูกต้องจากแพ็กเกจกลาง shared
import {
  LineAuthStatusResponse,
  ROLE_LABEL,
  ROLE_TONE,
  sanitizePhoneInput,
  validateThaiAddressHierarchy,
  validateThaiPhone,
} from '@japjong/shared';
// นำเข้า Custom Hook สำหรับดึงข้อมูลผู้ใช้งานที่ล็อกอินอยู่และฟังก์ชัน Refresh Session
import { useAuth } from '@/components/auth-context';
// นำเข้า AppShell คอมโพเนนต์เลย์เอาต์หลักของแอปพลิเคชัน
import { AppShell } from '@/components/shell';
// นำเข้าคอมโพเนนต์ฟอร์มเฉพาะทางสำหรับเบอร์โทรศัพท์ 10 หลัก และการเลือกที่อยู่ภาษาไทย
import {
  Phone10DigitInput,
  ThaiAddressSelect,
} from '@/components/thai-address-select';
// นำเข้า UI Components พื้นฐานของระบบ
import {
  Button,
  Card,
  Chip,
  Input,
  PinKeypad,
  SignatureBox,
  Tabs,
} from '@/components/ui';
// นำเข้า API client และฟังก์ชันแปลงวันที่เป็น พ.ศ.
import { api, formatThaiDate } from '@/lib/api';

// กำหนดประเภทชื่อแท็บในหน้าจัดการบัญชี
type AccountTab = 'profile' | 'password' | 'signature';

/**
 * คอมโพเนนต์ไอคอน LINE แบบ SVG กำหนดขนาดเริ่มต้นได้
 */
function LineIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.365 9.863c.349.002.63.285.63.631 0 .348-.281.63-.63.63h-2.12v1.341h2.12c.349 0 .63.283.63.631 0 .348-.281.63-.63.63h-2.752a.63.63 0 0 1-.63-.63V7.868c0-.348.281-.63.63-.63h2.752c.349 0 .63.282.63.63 0 .348-.281.63-.63.63h-2.12v1.365h2.12zm-4.704 3.232c0 .348-.282.63-.63.63a.628.628 0 0 1-.504-.254l-2.023-2.775v2.4c0 .347-.282.629-.63.629a.63.63 0 0 1-.631-.63V7.868c0-.348.282-.63.631-.63a.63.63 0 0 1 .504.254l2.023 2.776V7.868c0-.348.281-.63.63-.63.348 0 .63.282.63.63v5.227zm-5.864 0c0 .348-.282.63-.63.63a.63.63 0 0 1-.631-.63V7.868c0-.348.282-.63.631-.63.348 0 .63.282.63.63v5.227zM6.55 10.494h-2.12v2.601c0 .348-.282.63-.63.63a.63.63 0 0 1-.63-.63V7.868c0-.348.281-.63.63-.63.348 0 .63.282.63.63v2.626h2.12c.349 0 .63.282.63.63 0 .348-.281.63-.63.63zM12 2C6.477 2 2 5.925 2 10.767c0 4.398 3.668 8.082 8.618 8.683.336.073.792.222.908.51.104.258.068.663.033.924l-.145.875c-.044.267-.206 1.043.914.569 1.12-.474 6.046-3.56 8.249-6.096C21.65 14.07 22 12.482 22 10.767 22 5.925 17.523 2 12 2z" />
    </svg>
  );
}

/**
 * หน้าจัดการบัญชีผู้ใช้งาน (Account Page)
 * ประกอบด้วย: แก้ไขข้อมูลส่วนตัว/ที่อยู่, การเชื่อมต่อ LINE, เปลี่ยนรหัสผ่าน, และจัดการลายมือชื่อดิจิทัล & PIN 6 หลัก
 */
export default function AccountPage() {
  // ดึงข้อมูลบัญชีผู้ใช้ปัจจุบัน และฟังก์ชันรีเฟรชข้อมูลโปรไฟล์จาก Auth Context
  const { account, refreshMe } = useAuth();
  // State สำหรับแท็บที่กำลังเปิดอยู่ (ค่าเริ่มต้น: แท็บข้อมูลโปรไฟล์)
  const [activeTab, setActiveTab] = useState<AccountTab>('profile');

  // --- Profile state: เก็บข้อมูลฟอร์มโปรไฟล์และที่อยู่ ---
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

  // --- Password state: เก็บข้อมูลฟอร์มเปลี่ยนรหัสผ่าน ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  // --- Signature & PIN state: เก็บข้อมูลลายเซ็นและรหัส PIN ---
  const [signature, setSignature] = useState('');
  const [pin, setPin] = useState('');
  const [savingSig, setSavingSig] = useState(false);
  const [sigMsg, setSigMsg] = useState('');
  const [sigErr, setSigErr] = useState('');

  // --- LINE link state: สถานะการผูกบัญชีกับ LINE ---
  const [lineStatus, setLineStatus] = useState<LineAuthStatusResponse | null>(null);
  const [linkingLine, setLinkingLine] = useState(false);

  // ดึงสถานะการผูกบัญชี LINE และตรวจสอบ URL Query Parameters เมื่อ redirect กลับมา
  useEffect(() => {
    // ดึงสถานะการเชื่อมต่อ LINE จาก Backend
    api.getLineStatus().then(setLineStatus).catch(() => {});
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      // กรณีเชื่อมต่อ LINE สำเร็จ
      if (sp.get('line_linked') === '1') {
        setProfileMsg('เชื่อมต่อบัญชี LINE เรียบร้อยแล้ว');
        refreshMe();
        window.history.replaceState({}, '', '/account');
      } else if (sp.get('line_error')) {
        // กรณีเกิดข้อผิดพลาดในการเชื่อมต่อ LINE
        setProfileErr(decodeURIComponent(sp.get('line_error') || 'เชื่อมต่อ LINE ไม่สำเร็จ'));
        window.history.replaceState({}, '', '/account');
      }
    }
  }, [refreshMe]);

  /**
   * ฟังก์ชันขอ URL เพื่อเปลี่ยนเส้นทางไปหน้าขออนุญาตสิทธิ์ของ LINE Login (OAuth)
   */
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
      // Fallback ไปยัง direct link endpoint หาก API ล้มเหลว
      if (account?.id) {
        window.location.href = `/api/auth/line?linkUserId=${encodeURIComponent(account.id)}`;
        return;
      }
    }
    setLinkingLine(false);
  };

  /**
   * ฟังก์ชันยกเลิกการผูกบัญชี LINE กับบัญชีผู้ใช้นี้
   */
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

  // นำข้อมูลบัญชีที่มีอยู่มาใส่ลงใน Form state เมื่อโหลดข้อมูลผู้ใช้สำเร็จ
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

  /**
   * ฟังก์ชันบันทึกการแก้ไขข้อมูลโปรไฟล์และที่อยู่
   */
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileErr('');
    // ตรวจสอบชื่อ-นามสกุล
    if (!name.trim()) {
      setProfileErr('กรุณากรอกชื่อ-นามสกุล');
      return;
    }
    // ตรวจสอบหน่วยงาน/สังกัด
    if (!department.trim()) {
      setProfileErr('กรุณาระบุหน่วยงาน / ชุมชน / สังกัด');
      return;
    }
    // ตรวจสอบเบอร์โทรศัพท์ 10 หลัก
    const phoneCheck = validateThaiPhone(phone);
    if (!phoneCheck.valid) {
      setProfileErr(phoneCheck.error || 'กรุณากรอกเบอร์โทรศัพท์เป็นตัวเลข 10 หลัก');
      return;
    }
    // ตรวจสอบลำดับขั้นที่อยู่ไทย (จังหวัด -> อำเภอ -> ตำบล)
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
      // ส่งข้อมูลอัปเดตโปรไฟล์ไปยังเซิร์ฟเวอร์
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
      await refreshMe(); // รีเฟรชข้อมูลใน Auth Context
      setProfileMsg('บันทึกข้อมูลบัญชีและโปรไฟล์เรียบร้อยแล้ว');
      setTimeout(() => setProfileMsg(''), 3500);
    } catch (err) {
      setProfileErr((err as Error).message || 'ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setSavingProfile(false);
    }
  };

  /**
   * ฟังก์ชันรีเซ็ตฟอร์มข้อมูลส่วนตัวกลับเป็นค่าเดิมจากฐานข้อมูล
   */
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

  /**
   * ฟังก์ชันเปลี่ยนรหัสผ่านผู้ใช้งาน
   */
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
      // ล้างข้อมูลรหัสผ่านในฟอร์มเมื่อเปลี่ยนสำเร็จ
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

  /**
   * ฟังก์ชันบันทึกลายมือชื่อดิจิทัล (Base64 Canvas Image)
   */
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

  /**
   * ฟังก์ชันบันทึกรหัส PIN 6 หลักสำหรับการยืนยันการลงนาม
   * @param fullPin - รหัส PIN ตัวเลข 6 หลัก
   */
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
    // โครงเลย์เอาต์หลักของหน้าบัญชีผู้ใช้
    <AppShell title="จัดการบัญชีผู้ใช้งาน" maxWidth="max-w-none">
      {account && (
        <div className="flex w-full flex-col gap-4 sm:gap-5">
          {/* การ์ดสรุปข้อมูลโปรไฟล์ส่วนหัว (Header Card Summary) */}
          <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-6">
            <div className="flex items-center gap-4 min-w-0">
              {/* อวาตาร์แสดงอักษรย่อ */}
              <div className="size-14 rounded-full bg-brand-tint text-brand-ink font-bold text-title flex items-center justify-center shrink-0 border border-brand/20 sm:size-16">
                {account.initial || account.name.charAt(0) || 'ผ'}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-heading sm:text-title font-bold text-ink truncate">
                    {account.name}
                  </h1>
                  {/* ป้ายแสดงบทบาทของผู้ใช้ */}
                  <Chip tone={ROLE_TONE[account.role]}>
                    {ROLE_LABEL[account.role]}
                  </Chip>
                </div>
                {/* ข้อมูลชื่อผู้ใช้ ตำแหน่ง สังกัด และเบอร์โทร */}
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

            {/* สถานะความพร้อมในการลงนาม (มีลายเซ็น/ตั้ง PIN) และลิงก์ตั้งค่าแจ้งเตือน */}
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

          {/* แถบสลับแท็บเมนูจัดการบัญชี (Navigation Tabs) */}
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

          {/* แท็บที่ 1: ข้อมูลโปรไฟล์ ที่อยู่ และการผูกบัญชี LINE */}
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

                {/* ชื่อและชื่อเล่น */}
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

                {/* หน่วยงาน, เบอร์โทรศัพท์ และอีเมล */}
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

                {/* ส่วนที่อยู่สำหรับดึงไปกรอกแบบคำขอราชการอัตโนมัติ */}
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
                  {/* กล่องเลือกที่อยู่ไทยแบบเชื่อมโยง จังหวัด/อำเภอ/ตำบล */}
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

                {/* ส่วนการเชื่อมต่อบัญชี LINE (LINE Link) */}
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

                {/* ข้อความแจ้งเตือนข้อผิดพลาดโปรไฟล์ */}
                {profileErr && (
                  <div className="rounded-control bg-danger-bg border border-danger-fg/30 px-4 py-3 text-body text-danger-fg flex items-center gap-2">
                    <AlertCircle className="size-5 shrink-0" />
                    <span>{profileErr}</span>
                  </div>
                )}

                {/* ข้อความแจ้งเตือนสำเร็จโปรไฟล์ */}
                {profileMsg && (
                  <div className="rounded-control bg-brand-tint border border-brand px-4 py-3 text-body text-brand-ink font-semibold flex items-center gap-2">
                    <CheckCircle2 className="size-5 shrink-0" />
                    <span>{profileMsg}</span>
                  </div>
                )}

                {/* ปุ่มควบคุมด้านล่าง (คืนค่าเดิม / บันทึก) */}
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

          {/* แท็บที่ 2: เปลี่ยนรหัสผ่าน (Change Password) */}
          {activeTab === 'password' && (
            <Card className="w-full p-4 sm:p-6 lg:p-7">
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

                {/* ช่องกรอกรหัสผ่านปัจจุบัน */}
                <Input
                  type="password"
                  label="รหัสผ่านปัจจุบัน *"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านปัจจุบันของคุณ"
                  required
                />

                {/* ช่องกรอกรหัสผ่านใหม่ */}
                <Input
                  type="password"
                  label="รหัสผ่านใหม่ *"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="ตั้งรหัสผ่านใหม่อย่างน้อย 4 ตัวอักษร"
                  helperText="แนะนำให้ตั้งรหัสผ่านอย่างน้อย 8 ตัวอักษร ประกอบด้วยตัวอักษรและตัวเลข"
                  required
                />

                {/* ช่องยืนยันรหัสผ่านใหม่ */}
                <Input
                  type="password"
                  label="ยืนยันรหัสผ่านใหม่ *"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                  required
                />

                {/* ข้อความแจ้งเตือนข้อผิดพลาดรหัสผ่าน */}
                {pwdErr && (
                  <div className="rounded-control bg-danger-bg border border-danger-fg/30 px-4 py-3 text-body text-danger-fg flex items-center gap-2">
                    <AlertCircle className="size-5 shrink-0" />
                    <span>{pwdErr}</span>
                  </div>
                )}

                {/* ข้อความแจ้งเตือนสำเร็จรหัสผ่าน */}
                {pwdMsg && (
                  <div className="rounded-control bg-brand-tint border border-brand px-4 py-3 text-body text-brand-ink font-semibold flex items-center gap-2">
                    <CheckCircle2 className="size-5 shrink-0" />
                    <span>{pwdMsg}</span>
                  </div>
                )}

                {/* ปุ่มล้างข้อมูลและปุ่มบันทึกรหัสผ่าน */}
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

          {/* แท็บที่ 3: จัดการลายมือชื่อดิจิทัล & รหัส PIN 6 หลัก */}
          {activeTab === 'signature' && (
            <div className="flex flex-col gap-4 sm:gap-5">
              {/* ป้ายคำแนะนำการใช้งานระบบลงนาม */}
              <div className="rounded-control border border-line bg-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px]">
                <div className="flex items-start gap-2.5">
                  <KeyRound className="size-5 text-brand shrink-0 mt-0.5" />
                  <div>
                    <b className="text-ink font-semibold block text-[13.5px]">ระบบยืนยันตัวตนสำหรับการลงนาม (ลายเซ็น + PIN)</b>
                    <span className="text-muted leading-relaxed">
                      1. วาดบันทึกลายมือชื่อประจำตัว · 2. ตั้งรหัส <b>PIN 6 หลัก</b> ส่วนบุคคลสำหรับยืนยันการลงนาม
                    </span>
                  </div>
                </div>
                {account.signature && (
                  <Chip tone="green">พร้อมลงนาม</Chip>
                )}
              </div>

              {/* ข้อความแจ้งเตือนสำเร็จ/ล้มเหลว */}
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
                {/* การ์ดที่ 1: วาดและบันทึกลายเซ็นดิจิทัล (Signature Canvas) */}
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

                  {/* กล่องวาดลายเซ็น HTML5 Canvas */}
                  <SignatureBox
                    value={signature}
                    onChange={setSignature}
                    signerLabel={`${account.name} · ${account.position}`}
                    height={220}
                    skipPinPrompt
                  />

                  {/* ปุ่มบันทึกลายเซ็น */}
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

                {/* การ์ดที่ 2: แป้นกดตั้งรหัส PIN 6 หลัก (PinKeypad) */}
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

                  {/* แป้นพิมพ์ PIN 6 หลักแบบ Interactive */}
                  <div className="flex flex-col items-center gap-3">
                    <PinKeypad
                      pin={pin}
                      onChange={setPin}
                      subtitle="กดตัวเลข 6 หลักเพื่อตั้งหรือเปลี่ยนรหัส PIN ประจำตัวของคุณ"
                      onComplete={handleSavePin}
                    />
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
