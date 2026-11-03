'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppNotification, PublicAccount } from '@jongwen/shared';
import { MockAccountHint, api, clearStoredAuth, getStoredToken, setStoredAuth } from '@/lib/api';

interface AuthContextValue {
  account: PublicAccount | null;
  accounts: MockAccountHint[];
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  loginWithCredentials: (username: string, password: string) => Promise<PublicAccount>;
  loginWithDemo: (accountId: string) => Promise<PublicAccount>;
  registerAccount: (payload: {
    name: string;
    password: string;
    email?: string;
    phone?: string;
    otp?: string;
    lineName?: string;
    department?: string;
  }) => Promise<PublicAccount>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<MockAccountHint[]>([]);
  const [account, setAccount] = useState<PublicAccount | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshNotifications = useCallback(async () => {
    if (!getStoredToken()) {
      setNotifications([]);
      return;
    }
    try {
      const list = await api.notifications();
      setNotifications(list);
    } catch {
      // ignore
    }
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      if (getStoredToken()) {
        const me = await api.me();
        setAccount(me);
        await refreshNotifications();
      } else {
        setAccount(null);
        setNotifications([]);
      }
    } catch {
      // fallback
    }
  }, [refreshNotifications]);

  useEffect(() => {
    let active = true;

    const existing = getStoredToken();
    if (!existing) {
      if (active) {
        setAccount(null);
        setLoading(false);
      }
      return;
    }

    // มี token ค้างอยู่ -> ตรวจสอบว่าใช้ได้หรือไม่
    (async () => {
      try {
        const me = await api.me();
        if (active) {
          setAccount(me);
          setLoading(false);
        }
        refreshNotifications();
      } catch {
        clearStoredAuth();
        if (active) {
          setAccount(null);
          setLoading(false);
        }
      }
    })();

    // Safety timeout: ป้องกันการค้างหน้าจอนานเกิน 1.5 วินาที
    const timer = setTimeout(() => {
      if (active) setLoading(false);
    }, 1500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refreshNotifications]);

  const loginWithCredentials = useCallback(
    async (username: string, password: string) => {
      const res = await api.login({ username, password });
      setStoredAuth(res.token, res.account.id);
      setAccount(res.account);
      await refreshNotifications();
      return res.account;
    },
    [refreshNotifications],
  );

  const loginWithDemo = useCallback(
    async (accountId: string) => {
      const res = await api.demoLogin(accountId);
      setStoredAuth(res.token, res.account.id);
      setAccount(res.account);
      await refreshNotifications();
      return res.account;
    },
    [refreshNotifications],
  );

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

  const logout = useCallback(() => {
    api.logout().catch(() => {});
    clearStoredAuth();
    setAccount(null);
    setNotifications([]);
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, isRead: true, readAt: new Date().toISOString() } : n)),
      );
    } catch {
      await refreshNotifications();
    }
  }, [refreshNotifications]);

  const markAllNotificationsRead = useCallback(async () => {
    await api.readAllNotifications();
    await refreshNotifications();
  }, [refreshNotifications]);

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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function roleHomePath(role?: PublicAccount['role']): string {
  switch (role) {
    case 'STAFF':
      return '/staff';
    case 'APPROVER_L2':
    case 'APPROVER_L1':
      return '/approver';
    case 'ADMIN':
      return '/admin';
    default:
      return '/';
  }
}
