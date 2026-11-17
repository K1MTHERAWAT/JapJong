'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LANDING_CONFIG } from './landing-config';

/**
 * Sticky glassmorphism navigation bar for the public landing page.
 */
export function LandingNavbar() {
  return (
    <header className="sticky top-2 z-30 mx-auto max-w-7xl px-3 sm:px-6">
      <div className="rounded-card backdrop-blur-xl bg-surface/85 border border-line px-4 sm:px-5 py-3 flex items-center justify-between gap-4 shadow-sm">
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-control overflow-hidden shrink-0 flex items-center justify-center bg-surface-muted border border-line-soft p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt={`โลโก้${LANDING_CONFIG.appName}`}
              className="size-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-body leading-tight text-ink truncate">
              {LANDING_CONFIG.appName}{' '}
              <span className="text-brand-ink">{LANDING_CONFIG.appCode}</span>
            </div>
            <div className="text-caption text-ink-mute truncate">
              {LANDING_CONFIG.orgName}
            </div>
          </div>
        </Link>

        <nav
          aria-label="เมนูนำทางหน้าหลัก"
          className="hidden md:flex items-center gap-6 text-caption font-semibold text-ink-soft"
        >
          {LANDING_CONFIG.navLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="hover:text-brand-ink transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/login"
            className="hidden sm:inline-flex items-center justify-center px-3.5 py-2 rounded-control border border-line-input bg-surface text-caption font-semibold text-ink hover:bg-hover transition-colors"
          >
            เข้าสู่ระบบ
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-control bg-brand text-white text-caption font-semibold hover:bg-brand-ink transition-colors shadow-sm"
          >
            <span>เริ่มใช้งาน</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
