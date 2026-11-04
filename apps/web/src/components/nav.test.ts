import { describe, it, expect } from 'vitest';
import { getVisibleNav, NAV } from './nav';
import { PublicAccount } from '@japjong/shared';

describe('Navigation Menu Access Control (getVisibleNav)', () => {
  const mockSig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const baseCitizen: PublicAccount = {
    id: 'u-citizen',
    username: 'somchai',
    name: 'สมชาย ใจดี',
    nickname: 'สมชาย',
    initial: 'ส',
    role: 'USER',
    position: 'ประชาชน',
    department: 'กลุ่มแม่บ้าน',
    phone: '0812345678',
    permissions: { review: false, handover: false, walkIn: false, manageResources: false, sign: false, manageUsers: false },
    hasPin: false,
    signature: mockSig,
    createdAt: new Date().toISOString(),
  };

  const baseStaff: PublicAccount = {
    id: 'u-staff',
    username: 'suda',
    name: 'สุดา มีสุข',
    nickname: 'สุดา',
    initial: 'สุ',
    role: 'STAFF',
    position: 'เจ้าหน้าที่ธุรการ',
    department: 'สำนักปลัด',
    phone: '0825550101',
    permissions: { review: true, handover: true, walkIn: true, manageResources: true, sign: true, manageUsers: false },
    hasPin: true,
    signature: mockSig,
    createdAt: new Date().toISOString(),
  };

  const baseApproverL2: PublicAccount = {
    id: 'u-palad',
    username: 'wichai',
    name: 'วิชัย รักถิ่น',
    nickname: 'วิชัย',
    initial: 'วิ',
    role: 'APPROVER_L2',
    position: 'ปลัด อบต.',
    department: 'สำนักปลัด',
    phone: '0832220202',
    permissions: { review: false, handover: false, walkIn: false, manageResources: false, sign: true, manageUsers: false },
    hasPin: true,
    signature: mockSig,
    createdAt: new Date().toISOString(),
  };

  const baseAdmin: PublicAccount = {
    id: 'u-admin',
    username: 'admin',
    name: 'ผู้ดูแลระบบ',
    nickname: 'แอดมิน',
    initial: 'แ',
    role: 'ADMIN',
    position: 'ผู้ดูแลระบบ',
    department: 'ศูนย์สารสนเทศ',
    phone: '0899999999',
    permissions: { review: true, handover: true, walkIn: true, manageResources: true, sign: true, manageUsers: true },
    hasPin: true,
    signature: mockSig,
    createdAt: new Date().toISOString(),
  };

  it('renders only public & citizen menus for unauthenticated guests', () => {
    const visible = getVisibleNav(null);
    expect(visible.some((i) => i.href === '/')).toBe(true);
    expect(visible.some((i) => i.href === '/booking')).toBe(true);
    expect(visible.some((i) => i.href === '/borrow')).toBe(true);
    expect(visible.some((i) => i.href === '/repair')).toBe(true);

    // Should NOT see officer or admin menus
    expect(visible.some((i) => i.href === '/staff/review')).toBe(false);
    expect(visible.some((i) => i.href === '/approver')).toBe(false);
    expect(visible.some((i) => i.href === '/admin')).toBe(false);
  });

  it('renders citizen personal menus but hides officer menus for citizen user', () => {
    const visible = getVisibleNav(baseCitizen);
    expect(visible.some((i) => i.href === '/history')).toBe(true);
    expect(visible.some((i) => i.href === '/notifications')).toBe(true);
    expect(visible.some((i) => i.href === '/account')).toBe(true);

    // Citizens cannot see staff or approver menus
    expect(visible.some((i) => i.href === '/staff/review')).toBe(false);
    expect(visible.some((i) => i.href === '/staff/handover')).toBe(false);
    expect(visible.some((i) => i.href === '/approver')).toBe(false);
    expect(visible.some((i) => i.href === '/admin')).toBe(false);
    expect(visible.some((i) => i.href === '/admin/line')).toBe(false);
  });

  it('renders staff operations menus for staff role', () => {
    const visible = getVisibleNav(baseStaff);
    expect(visible.some((i) => i.href === '/staff/review')).toBe(true);
    expect(visible.some((i) => i.href === '/staff/handover')).toBe(true);
    expect(visible.some((i) => i.href === '/staff/walk-in')).toBe(true);
    expect(visible.some((i) => i.href === '/admin/resources')).toBe(true);

    // Staff cannot see approver L1/L2 approval queue or admin user management
    expect(visible.some((i) => i.href === '/approver')).toBe(false);
    expect(visible.some((i) => i.href === '/admin/permissions')).toBe(false);
  });

  it('renders executive signing queue for Approver L2 (Palad)', () => {
    const visible = getVisibleNav(baseApproverL2);
    expect(visible.some((i) => i.href === '/approver')).toBe(true);

    // Cannot access staff operations or admin
    expect(visible.some((i) => i.href === '/staff/review')).toBe(false);
    expect(visible.some((i) => i.href === '/admin')).toBe(false);
  });

  it('renders admin and governance menus for Admin role and hides citizen/staff services', () => {
    const visible = getVisibleNav(baseAdmin);
    expect(visible.some((i) => i.href === '/admin')).toBe(true);
    expect(visible.some((i) => i.href === '/admin/line')).toBe(true);
    expect(visible.some((i) => i.href === '/admin/notifications')).toBe(true);
    expect(visible.some((i) => i.href === '/admin/resources')).toBe(true);
    expect(visible.some((i) => i.href === '/admin/permissions')).toBe(true);

    // Citizen services (Image 2) must be hidden for Admin
    expect(visible.some((i) => i.href === '/')).toBe(false);
    expect(visible.some((i) => i.href === '/booking')).toBe(false);
    expect(visible.some((i) => i.href === '/borrow')).toBe(false);
    expect(visible.some((i) => i.href === '/repair')).toBe(false);
    expect(visible.some((i) => i.href === '/staff/review')).toBe(false);
    expect(visible.some((i) => i.href === '/staff/handover')).toBe(false);
  });
});
