'use client';

/**
 * =====================================================================
 * ระบบจัดการสถานะการยืนยันตัวตน (Authentication & Session Context)
 * =====================================================================
 * ไฟล์ศูนย์กลางควบคุม Session, ข้อมูลผู้ใช้ (Account), Token, และการแจ้งเตือน (Notifications)
 * - ตรวจสอบ Session จาก Stored Token เมื่อโหลดหน้าเว็บ พร้อม Safety Timeout
 * - จัดการ Login, Demo Login, Register และ Logout
 * - จัดการสถานะการแจ้งเตือน และจำนวนที่ยังไม่ได้อ่าน (unreadCount)
 * - กำหนดเส้นทางหน้าแรกตามบทบาทผู้ใช้ (roleHomePath)
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
// โครงสร้างประเภทข้อมูลการแจ้งเตือนและบัญชีผู้ใช้จาก Shared Package
import { AppNotification, PublicAccount } from '@japjong/shared';
// ฟังก์ชันเรียก API และการจัดการ Token ใน LocalStorage/Cookie
import { MockAccountHint, api, clearStoredAuth, getStoredToken, setStoredAuth } from '@/lib/api';

/**
 * Interface กำหนดคุณสมบัติและฟังก์ชันทั้งหมดที่ AuthContext ให้บริการแก่ Component ต่างๆ
 */
interface AuthContextValue {
  /** ข้อมูลบัญชีผู้ใช้ปัจจุบันที่ล็อกอินอยู่ (null หากยังไม่ล็อกอิน) */
  account: PublicAccount | null;
  /** รายชื่อบัญชีตัวอย่างจำลอง */
  accounts: MockAccountHint[];
  /** รายการการแจ้งเตือนทั้งหมดของผู้ใช้ */
  notifications: AppNotification[];
  /** จำนวนการแจ้งเตือนที่ยังไม่ได้อ่าน */
  unreadCount: number;
  /** สถานะการตรวจสอบ Session เริ่มต้น */
  loading: boolean;
  /** ฟังก์ชันล็อกอินด้วย Username และ Password */
  loginWithCredentials: (username: string, password: string) => Promise<PublicAccount>;
  /** ฟังก์ชันล็อกอินด้วยบัญชีทดสอบ (1-Click Demo Login) */
  loginWithDemo: (accountId: string) => Promise<PublicAccount>;
  /** ฟังก์ชันลงทะเบียนบัญชีใหม่ */
  registerAccount: (payload: {
    name: string;
    password: string;
    email?: string;
    phone?: string;
    otp?: string;
    lineName?: string;
    department?: string;
  }) => Promise<PublicAccount>;
  /** ฟังก์ชันออกจากระบบและล้าง Token */
  logout: () => void;
  /** ฟังก์ชันโหลดข้อมูลบัญชีปัจจุบันใหม่ */
  refreshMe: () => Promise<void>;
  /** ฟังก์ชันโหลดรายการแจ้งเตือนใหม่ */
  refreshNotifications: () => Promise<void>;
  /** ทำเครื่องหมายการแจ้งเตือนรายการหนึ่งว่าอ่านแล้ว */
  markNotificationRead: (id: string) => Promise<void>;
  /** ทำเครื่องหมายการแจ้งเตือนทั้งหมดว่าอ่านแล้ว */
  markAllNotificationsRead: () => Promise<void>;
}

// สร้าง Context สำหรับ Authentication
const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provider ครอบแอปพลิเคชันสำหรับส่งผ่าน Context ด้าน Auth
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  // สถานะบัญชีตัวอย่าง
  const [accounts, setAccounts] = useState<MockAccountHint[]>([]);
  // สถานะบัญชีผู้ใช้ที่กำลังเข้าใช้งาน
  const [account, setAccount] = useState<PublicAccount | null>(null);
  // สถานะรายการแจ้งเตือน
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  // สถานะการโหลดเซสชันเริ่มต้น
  const [loading, setLoading] = useState(true);

  /**
   * ดึงรายการแจ้งเตือนล่าสุดของผู้ใช้จาก Backend API
   */
  const refreshNotifications = useCallback(async () => {
    // หากไม่มี token ไม่ต้องดึงข้อมูล
    if (!getStoredToken()) {
      setNotifications([]);
      return;
    }
    try {
      const list = await api.notifications();
      setNotifications(list);
    } catch {
      // ข้ามข้อผิดพลาดกรณีดึงการแจ้งเตือนไม่สำเร็จเพื่อไม่ให้กระทบการทำงานหลัก
    }
  }, []);

  /**
   * ตรวจสอบและดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบันจากเซิร์ฟเวอร์
   */
  const refreshMe = useCallback(async () => {
    try {
      if (getStoredToken()) {
        const me = await api.me();
        setAccount(me);
        // ดึงการแจ้งเตือนควบคู่ไปด้วย
        await refreshNotifications();
      } else {
        setAccount(null);
        setNotifications([]);
      }
    } catch {
      // หากเกิดข้อผิดพลาดให้ fallback ปล่อยผ่าน
    }
  }, [refreshNotifications]);

  /**
   * Effect ตรวจสอบ Token ที่เก็บไว้เมื่อแอปพลิเคชันโหลดครั้งแรก (Session Restoration)
   */
  useEffect(() => {
    let active = true;

    const existing = getStoredToken();
    // หากไม่มี Token ในระบบ ให้ยกเลิกสถานะโหลดทันที
    if (!existing) {
      if (active) {
        setAccount(null);
        setLoading(false);
      }
      return;
    }

    // มี Token ค้างอยู่ -> ตรวจสอบกับ Backend API ว่ายังใช้งานได้หรือไม่
    (async () => {
      try {
        const me = await api.me();
        if (active) {
          setAccount(me);
          setLoading(false);
        }
        refreshNotifications();
      } catch {
        // หาก Token หมดอายุหรือไม่ถูกต้อง ให้ล้าง Token และตั้งค่าเป็นยังไม่ล็อกอิน
        clearStoredAuth();
        if (active) {
          setAccount(null);
          setLoading(false);
        }
      }
    })();

    // Safety timeout: ป้องกันการค้างหน้าจอหมุนโหลดนานเกิน 1.5 วินาทีหากเครือข่ายตอบสนองช้า
    const timer = setTimeout(() => {
      if (active) setLoading(false);
    }, 1500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refreshNotifications]);

  /**
   * ล็อกอินด้วยชื่อผู้ใช้และรหัสผ่าน
   */
  const loginWithCredentials = useCallback(
    async (username: string, password: string) => {
      const res = await api.login({ username, password });
      // บันทึก Token ลงที่จัดเก็บในเบราว์เซอร์
      setStoredAuth(res.token, res.account.id);
      setAccount(res.account);
      await refreshNotifications();
      return res.account;
    },
    [refreshNotifications],
  );

  /**
   * ล็อกอินด่วนด้วยบัญชีตัวอย่างสาธิต (Demo Account)
   */
  const loginWithDemo = useCallback(
    async (accountId: string) => {
      const res = await api.demoLogin(accountId);
      // บันทึก Token ลงที่จัดเก็บ
      setStoredAuth(res.token, res.account.id);
      setAccount(res.account);
      await refreshNotifications();
      return res.account;
    },
    [refreshNotifications],
  );

  /**
   * ลงทะเบียนบัญชีผู้ใช้ใหม่
   */
  const registerAccount = useCallback(
    async (payload: {
      name: string;
      password: string;
      email?: string;
      phone?: string;
      otp?: string;
      lineName?: string;
      department?: string;
    }) => {
      const res = await api.register(payload);
      setStoredAuth(res.token, res.account.id);
      setAccount(res.account);
      await refreshNotifications();
      return res.account;
    },
    [refreshNotifications],
  );

  /**
   * ฟังก์ชันออกจากระบบ: ล้างเซสชันและข้อมูลในหน่วยความจำ
   */
  const logout = useCallback(() => {
    // ส่งคำขอแจ้งฝั่งเซิร์ฟเวอร์
    api.logout().catch(() => {});
    // ล้าง Token ในคุกกี้และ LocalStorage
    clearStoredAuth();
    setAccount(null);
    setNotifications([]);
  }, []);

  /**
   * ทำเครื่องหมายรายการแจ้งเตือนว่าอ่านแล้ว
   */
  const markNotificationRead = useCallback(async (id: string) => {
    try {
      await api.markNotificationRead(id);
      // ปรับปรุงสถานะแบบ Optimistic ใน Client State ทันที
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, isRead: true, readAt: new Date().toISOString() } : n)),
      );
    } catch {
      await refreshNotifications();
    }
  }, [refreshNotifications]);

  /**
   * ทำเครื่องหมายการแจ้งเตือนทั้งหมดว่าอ่านแล้ว
   */
  const markAllNotificationsRead = useCallback(async () => {
    await api.readAllNotifications();
    await refreshNotifications();
  }, [refreshNotifications]);

  // คำนวณจำนวนการแจ้งเตือนที่ยังไม่ได้อ่าน
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <AuthContext.Provider
      value={{
        account,
        accounts,
        notifications,
        unreadCount,
        loading,
        loginWithCredentials,
        loginWithDemo,
        registerAccount,
        logout,
        refreshMe,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Custom Hook สำหรับเรียกใช้งาน AuthContext ภายในคอมโพเนนต์
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/**
 * กำหนดเส้นทางหน้าหลัก (Default Home Path) ตามบทบาทของผู้ใช้ (RBAC)
 */
export function roleHomePath(role?: PublicAccount['role']): string {
  switch (role) {
    case 'STAFF':
      return '/staff'; // หน้าแดชบอร์ดเจ้าหน้าที่
    case 'APPROVER_L2':
    case 'APPROVER_L1':
      return '/approver'; // หน้ารายการอนุมัติสำหรับปลัด/นายก อบต.
    case 'ADMIN':
      return '/admin'; // หน้าแดชบอร์ดผู้ดูแลระบบ
    default:
      return '/'; // หน้าหลักสำหรับประชาชนทั่วไป
  }
}

