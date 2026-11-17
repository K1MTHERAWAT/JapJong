'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, Package, QrCode } from 'lucide-react';
import { Equipment, Venue } from '@japjong/shared';
import { LANDING_CONFIG } from './landing-config';
import { AnimatedCounter, ScrollReveal } from './ScrollReveal';

interface LandingHeroProps {
  venues: Venue[];
  equipment: Equipment[];
  servicesCount: number;
  loading: boolean;
}

/**
 * Hero section with tech-grid backdrop, subtle scroll parallax,
 * real resource counters, and live database-backed availability preview.
 */
export function LandingHero({
  venues,
  equipment,
  servicesCount,
  loading,
}: LandingHeroProps) {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        if (y < 600) setScrollY(y);
        rafId = 0;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const activeVenues = venues.filter((v) => v.enabled && v.status === 'available');
  const activeEquipment = equipment.filter((e) => e.enabled);

  return (
    <section className="relative overflow-hidden landing-tech-grid px-4 pt-10 pb-14 sm:px-6 md:pt-14 md:pb-20">
      {/* Ambient Parallax Glow Orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full bg-brand/15 blur-3xl transition-transform duration-150"
        style={{
          transform: `translate3d(${scrollY * 0.05}px, ${scrollY * 0.1}px, 0)`,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-brand-ink/10 blur-3xl transition-transform duration-150"
        style={{
          transform: `translate3d(${-scrollY * 0.05}px, ${-scrollY * 0.08}px, 0)`,
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-center">
        {/* Left Column */}
        <div className="lg:col-span-7 space-y-6">
          <ScrollReveal immediate>
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-brand-tint border border-brand/30 text-brand-ink text-caption font-semibold">
              <span className="relative w-2 h-2 rounded-full bg-brand landing-pulse-dot" />
              <span>{LANDING_CONFIG.orgName} · เว็บ &amp; LINE LIFF</span>
            </div>
          </ScrollReveal>

          <ScrollReveal immediate delayMs={100}>
            <h1 className="text-[28px] sm:text-4xl md:text-5xl font-bold leading-tight tracking-tight text-ink">
              จองสถานที่ ยืมครุภัณฑ์
              <br />
              แจ้งซ่อม{' '}
              <span className="text-brand-ink">ครบจบในที่เดียว</span>
            </h1>
          </ScrollReveal>

          <ScrollReveal immediate delayMs={180}>
            <p className="text-body md:text-base text-ink-mute leading-relaxed max-w-xl">
              ยกระดับงานบริการภาครัฐด้วยระบบยื่นคำขอออนไลน์ 24 ชั่วโมง
              เช็กตารางว่างและจำนวนครุภัณฑ์คงเหลือจากฐานข้อมูลจริง
              พร้อมใบอนุญาตดิจิทัลที่มี QR Code ตรวจสอบความถูกต้องได้ทันที
            </p>
          </ScrollReveal>

          <ScrollReveal immediate delayMs={260}>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-control bg-brand text-white text-body font-semibold hover:bg-brand-ink transition-all shadow-md"
              >
                <span>ยื่นคำขอออนไลน์ทันที</span>
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/verify"
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-control border border-line-input bg-surface text-body font-semibold text-ink hover:bg-hover transition-all"
              >
                <QrCode className="size-4 text-brand-ink" />
                <span>ตรวจสอบใบอนุญาต (QR)</span>
              </Link>
            </div>
          </ScrollReveal>

          {/* Real Data Counters */}
          <ScrollReveal immediate delayMs={340}>
            <div className="grid grid-cols-3 gap-4 pt-5 border-t border-line max-w-lg">
              <div>
                <div className="text-2xl font-bold text-ink tabular-nums">
                  {loading ? '—' : <AnimatedCounter target={activeVenues.length} />}{' '}
                  <span className="text-body font-semibold">แห่ง</span>
                </div>
                <div className="text-caption text-ink-mute">สถานที่พร้อมให้บริการ</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-brand-ink tabular-nums">
                  {loading ? '—' : <AnimatedCounter target={activeEquipment.length} />}{' '}
                  <span className="text-body font-semibold">รายการ</span>
                </div>
                <div className="text-caption text-ink-mute">ครุภัณฑ์ในคลังพัสดุ</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-ink tabular-nums">
                  {loading ? '—' : <AnimatedCounter target={servicesCount} />}{' '}
                  <span className="text-body font-semibold">บริการ</span>
                </div>
                <div className="text-caption text-ink-mute">เปิดให้บริการออนไลน์</div>
              </div>
            </div>
          </ScrollReveal>
        </div>

        {/* Right Column: Live Resource Preview Card from DB */}
        <div className="lg:col-span-5">
          <div
            className="landing-float rounded-card bg-surface/95 backdrop-blur-xl border border-line p-5 shadow-xl space-y-4 transition-transform duration-200"
            style={{
              transform: `translateY(${scrollY * 0.04}px)`,
            }}
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-brand" />
                <span className="text-caption font-bold text-ink">
                  ทรัพยากรที่เปิดให้บริการจริงในระบบ
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-full text-caption font-semibold bg-brand-tint text-brand-ink">
                Live Data
              </span>
            </div>

            {loading ? (
              <div className="space-y-3 py-2" aria-busy="true">
                <div className="h-16 rounded-control bg-surface-muted animate-pulse" />
                <div className="h-16 rounded-control bg-surface-muted animate-pulse" />
                <div className="h-16 rounded-control bg-surface-muted animate-pulse" />
              </div>
            ) : activeVenues.length === 0 && activeEquipment.length === 0 ? (
              <div className="rounded-control bg-surface-muted border border-line p-6 text-center space-y-1">
                <div className="text-body font-semibold text-ink">
                  ยังไม่มีรายการสถานที่หรือครุภัณฑ์ที่เปิดใช้งาน
                </div>
                <p className="text-caption text-ink-mute">
                  ผู้ดูแลระบบสามารถเพิ่มรายการสถานที่และครุภัณฑ์ได้จากหน้าจัดการทรัพยากร
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeVenues.slice(0, 2).map((venue) => (
                  <div
                    key={venue.id}
                    className="landing-sleek-card p-3.5 rounded-control bg-surface-muted border border-line flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-caption font-semibold bg-type-booking-bg text-type-booking-fg">
                        <Building2 className="size-3" />
                        <span>สถานที่ราชการ</span>
                      </span>
                      <div className="text-body font-semibold text-ink truncate">
                        {venue.name}
                      </div>
                      <div className="text-caption text-ink-mute truncate">
                        {[venue.building, venue.capacity ? `รองรับ ${venue.capacity} คน` : null]
                          .filter(Boolean)
                          .join(' · ') || 'เปิดให้จองออนไลน์'}
                      </div>
                    </div>
                    <span className="shrink-0 px-2.5 py-1 rounded-full text-caption font-semibold bg-ok-bg text-ok-fg">
                      พร้อมใช้งาน
                    </span>
                  </div>
                ))}

                {activeEquipment.slice(0, 2).map((item) => (
                  <div
                    key={item.id}
                    className="landing-sleek-card p-3.5 rounded-control bg-surface-muted border border-line flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-caption font-semibold bg-type-borrow-bg text-type-borrow-fg">
                        <Package className="size-3" />
                        <span>ครุภัณฑ์</span>
                      </span>
                      <div className="text-body font-semibold text-ink truncate">
                        {item.name}
                      </div>
                      <div className="text-caption text-ink-mute truncate">
                        คลังพัสดุคงเหลือ {item.stock} ชิ้น
                      </div>
                    </div>
                    <span
                      className={[
                        'shrink-0 px-2.5 py-1 rounded-full text-caption font-semibold',
                        item.stock > 0
                          ? 'bg-ok-bg text-ok-fg'
                          : 'bg-warn-bg text-warn-fg',
                      ].join(' ')}
                    >
                      {item.stock > 0 ? 'พร้อมให้ยืม' : 'ถูกยืมเต็ม'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
