import { Account, DEFAULT_PERMISSIONS } from '@jongwen/shared';

/**
 * Demo data accounts — ใช้สำหรับทดสอบทุกบทบาทในโหมดเดโม
 * รหัสผ่านทุกบัญชี: 1234   ·   PIN ลงนาม: 123456
 */
export const MOCK_PASSWORD = '1234';
export const MOCK_PIN = '123456';

function strokeSvgDataUrl(paths: string[]): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 110" fill="none">${paths
    .map(
      (d) =>
        `<path d="${d}" stroke="#085041" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('')}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** ลายเซ็นที่วาดด้วยเส้นปากกาจริง (Vector Stroke Data URL) สำหรับแต่ละบัญชีตัวอย่าง */
export const MOCK_SIGNATURES = {
  somchai: strokeSvgDataUrl([
    'M 34 74 C 48 30, 72 28, 66 66 C 62 84, 88 38, 106 58 C 118 72, 132 42, 148 64 C 164 82, 188 38, 212 56 C 232 70, 262 52, 288 46',
    'M 52 86 Q 155 76 274 82',
  ]),
  manee: strokeSvgDataUrl([
    'M 42 70 C 52 34, 78 34, 84 68 C 90 42, 114 38, 122 68 C 134 48, 158 42, 174 66 C 194 44, 226 48, 266 56',
    'M 64 84 Q 160 78 258 84',
  ]),
  suda: strokeSvgDataUrl([
    'M 48 72 C 64 26, 94 26, 86 68 C 82 88, 118 36, 138 62 C 154 78, 178 40, 204 60 C 224 74, 250 50, 278 44',
    'M 62 86 C 128 78, 204 76, 268 82',
  ]),
  wichai: strokeSvgDataUrl([
    'M 36 68 C 56 22, 82 28, 78 72 C 96 34, 126 32, 136 68 C 152 38, 184 36, 198 64 C 218 46, 252 44, 286 52',
    'M 48 86 Q 168 72 282 84',
  ]),
  prasert: strokeSvgDataUrl([
    'M 30 76 C 46 20, 78 20, 74 70 C 72 88, 106 30, 128 60 C 148 80, 172 32, 196 58 C 216 78, 248 38, 292 48',
    'M 44 88 C 124 76, 212 74, 288 84',
  ]),
  admin: strokeSvgDataUrl([
    'M 46 72 C 66 28, 92 32, 98 68 C 116 40, 148 40, 166 64 C 190 44, 232 48, 272 54',
    'M 58 84 Q 165 78 266 82',
  ]),
};

export const mockAccounts: Account[] = [
  {
    id: 'u-somchai',
    username: 'somchai',
    password: MOCK_PASSWORD,
    name: 'สมชาย ใจดี',
    nickname: 'สมชาย',
    initial: 'ส',
    role: 'USER',
    position: 'ประชาชน',
    department: 'กลุ่มแม่บ้านบ้านหนองบัว',
    phone: '081-234-5678',
    lineName: 'Somchai',
    email: 'somchai@namcham.go.th',
    emailVerified: true,
    addressHouseNo: '124/5',
    addressMoo: '3',
    addressSubdistrict: 'น้ำชำ',
    addressDistrict: 'สูงเม่น',
    addressProvince: 'แพร่',
    permissions: { ...DEFAULT_PERMISSIONS.USER },
    signature: MOCK_SIGNATURES.somchai,
    pin: MOCK_PIN,
    isDemo: true,
    createdAt: '2026-09-01T09:00:00+07:00',
  },
  {
    id: 'u-manee',
    username: 'manee',
    password: MOCK_PASSWORD,
    name: 'มานี มีนา',
    nickname: 'มานี',
    initial: 'ม',
    role: 'USER',
    position: 'ประชาชน',
    department: 'กองสวัสดิการสังคม',
    phone: '089-111-2233',
    lineName: 'Manee',
    email: 'manee@namcham.go.th',
    emailVerified: true,
    permissions: { ...DEFAULT_PERMISSIONS.USER },
    signature: MOCK_SIGNATURES.manee,
    pin: MOCK_PIN,
    isDemo: true,
    createdAt: '2026-09-12T10:00:00+07:00',
  },
  {
    id: 's-suda',
    username: 'suda',
    password: MOCK_PASSWORD,
    name: 'สุดา มีสุข',
    nickname: 'สุดา',
    initial: 'สุ',
    role: 'STAFF',
    position: 'เจ้าหน้าที่ธุรการ',
    department: 'สำนักปลัด อบต.',
    phone: '082-555-0101',
    email: 'suda@namcham.go.th',
    emailVerified: true,
    permissions: { ...DEFAULT_PERMISSIONS.STAFF },
    signature: MOCK_SIGNATURES.suda,
    pin: MOCK_PIN,
    isDemo: true,
    createdAt: '2026-01-10T09:00:00+07:00',
  },
  {
    id: 'a-wichai',
    username: 'wichai',
    password: MOCK_PASSWORD,
    name: 'วิชัย รักถิ่น',
    nickname: 'วิชัย',
    initial: 'วิ',
    role: 'APPROVER_L2',
    position: 'ปลัด อบต.',
    department: 'สำนักปลัด อบต.',
    phone: '083-222-0202',
    email: 'wichai@namcham.go.th',
    emailVerified: true,
    permissions: { ...DEFAULT_PERMISSIONS.APPROVER_L2 },
    signature: MOCK_SIGNATURES.wichai,
    pin: MOCK_PIN,
    isDemo: true,
    createdAt: '2026-01-10T09:00:00+07:00',
  },
  {
    id: 'a-prasert',
    username: 'prasert',
    password: MOCK_PASSWORD,
    name: 'ประเสริฐ ศรีสุข',
    nickname: 'ประเสริฐ',
    initial: 'ป',
    role: 'APPROVER_L1',
    position: 'นายก อบต.',
    department: 'องค์การบริหารส่วนตำบล',
    phone: '084-333-0303',
    email: 'prasert@namcham.go.th',
    emailVerified: true,
    permissions: { ...DEFAULT_PERMISSIONS.APPROVER_L1 },
    signature: MOCK_SIGNATURES.prasert,
    pin: MOCK_PIN,
    isDemo: true,
    createdAt: '2026-01-10T09:00:00+07:00',
  },
  {
    id: 'ad-admin',
    username: 'admin',
    password: MOCK_PASSWORD,
    name: 'ผู้ดูแลระบบ',
    nickname: 'แอดมิน',
    initial: 'อ',
    role: 'ADMIN',
    position: 'ผู้ดูแลระบบ',
    department: 'ฝ่ายเทคโนโลยีสารสนเทศ',
    phone: '085-444-0404',
    email: 'admin@namcham.go.th',
    emailVerified: true,
    permissions: { ...DEFAULT_PERMISSIONS.ADMIN },
    signature: MOCK_SIGNATURES.admin,
    pin: MOCK_PIN,
    isDemo: true,
    createdAt: '2026-01-01T09:00:00+07:00',
  },
];
