'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Equipment, SidebarServiceItem, Venue } from '@japjong/shared';
import { api } from '@/lib/api';
import { LANDING_CONFIG } from './landing-config';
import { LandingHero } from './LandingHero';
import { LandingNavbar } from './LandingNavbar';
import { LandingServices } from './LandingServices';
import { LandingTechAndVerify } from './LandingTechAndVerify';
import { LandingWorkflow } from './LandingWorkflow';
import { ScrollProgressBar, ScrollReveal } from './ScrollReveal';

/**
 * Public Landing Page shown at `/` for unauthenticated visitors.
 * Fetches real venues, equipment, and public services from existing backend APIs.
 */
export function LandingPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [services, setServices] = useState<SidebarServiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      api.venues(),
      api.equipment(),
      api.getNavigation(),
    ])
      .then(([venuesRes, equipmentRes, navRes]) => {
        if (!active) return;
        if (venuesRes.status === 'fulfilled' && Array.isArray(venuesRes.value)) {
          setVenues(venuesRes.value);
        }
        if (
          equipmentRes.status === 'fulfilled' &&
          Array.isArray(equipmentRes.value)
        ) {
          setEquipment(equipmentRes.value);
        }
        if (navRes.status === 'fulfilled' && Array.isArray(navRes.value)) {
          setServices(navRes.value);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const activeServicesCount = services.filter(
    (s) =>
      s.enabled &&
      s.href !== '/' &&
      !s.href.startsWith('/history') &&
      !s.href.startsWith('/account') &&
      !s.href.startsWith('/notifications'),
  ).length;

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <ScrollProgressBar />
      <LandingNavbar />

      <main className="flex-1">
        <LandingHero
          venues={venues}
          equipment={equipment}
          servicesCount={activeServicesCount}
          loading={loading}
        />

        <LandingServices
          services={services}
          venuesCount={venues.filter((v) => v.enabled && v.status === 'available').length}
          equipmentCount={equipment.filter((e) => e.enabled).length}
          loading={loading}
        />

        <LandingWorkflow />

        <LandingTechAndVerify />

        {/* Bottom CTA */}
        <section className="px-4 py-12 sm:px-6">
          <div className="max-w-7xl mx-auto">
            <ScrollReveal>
              <div className="rounded-card bg-brand text-white p-7 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-lg">
                <div className="space-y-2">
                  <h2 className="text-title md:text-display font-bold">
                    พร้อมใช้งาน{LANDING_CONFIG.appName}แล้วหรือยัง?
                  </h2>
                  <p className="text-caption md:text-body text-white/85 max-w-xl">
                    เข้าสู่ระบบด้วยบัญชีผู้ใช้ LINE Login หรือ Gov Center SSO
                    เพื่อยื่นคำขอและติดตามสถานะแบบเรียลไทม์
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 shrink-0">
                  <Link
                    href="/login"
                    className="px-5 py-3 rounded-control bg-white text-brand-ink text-caption font-bold hover:bg-white/90 transition-colors shadow-sm"
                  >
                    เข้าสู่ระบบ
                  </Link>
                  <Link
                    href="/verify"
                    className="px-5 py-3 rounded-control border border-white/40 text-white text-caption font-bold hover:bg-white/10 transition-colors"
                  >
                    ตรวจสอบใบอนุญาต (QR)
                  </Link>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </main>

      <footer className="px-4 py-6 sm:px-6 border-t border-line bg-surface">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-caption text-ink-mute">
          <div>
            {LANDING_CONFIG.appName} ({LANDING_CONFIG.appCode}) ·{' '}
            {LANDING_CONFIG.orgName}
          </div>
          <div className="flex items-center gap-5">
            <a href="#services" className="hover:text-ink transition-colors">
              บริการหลัก
            </a>
            <a href="#workflow" className="hover:text-ink transition-colors">
              ขั้นตอนอนุมัติ
            </a>
            <Link href="/verify" className="hover:text-ink transition-colors">
              ตรวจสอบเอกสาร
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
