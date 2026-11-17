'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, Layers, Package, Wrench } from 'lucide-react';
import { SidebarServiceItem } from '@japjong/shared';
import { ScrollReveal } from './ScrollReveal';

interface LandingServicesProps {
  services: SidebarServiceItem[];
  venuesCount: number;
  equipmentCount: number;
  loading: boolean;
}

function getServiceVisual(route: string) {
  if (route.includes('booking')) {
    return {
      icon: Building2,
      badgeClass: 'bg-type-booking-bg text-type-booking-fg',
      badgeLabel: 'สถานที่ราชการ',
    };
  }
  if (route.includes('borrow')) {
    return {
      icon: Package,
      badgeClass: 'bg-type-borrow-bg text-type-borrow-fg',
      badgeLabel: 'ยืม–คืนครุภัณฑ์',
    };
  }
  if (route.includes('repair')) {
    return {
      icon: Wrench,
      badgeClass: 'bg-type-repair-bg text-type-repair-fg',
      badgeLabel: 'แจ้งซ่อมบำรุง',
    };
  }
  return {
    icon: Layers,
    badgeClass: 'bg-brand-tint text-brand-ink',
    badgeLabel: 'บริการออนไลน์',
  };
}

function getLiveCountText(
  route: string,
  venuesCount: number,
  equipmentCount: number,
): string {
  if (route.includes('booking')) return `พร้อมจอง ${venuesCount} แห่ง`;
  if (route.includes('borrow')) return `คลังพัสดุ ${equipmentCount} รายการ`;
  if (route.includes('repair')) return 'ติดตามสถานะงานซ่อม 24 ชม.';
  return 'เปิดให้บริการออนไลน์';
}

/**
 * Core services grid populated dynamically from database-configured SidebarServiceItem[].
 */
export function LandingServices({
  services,
  venuesCount,
  equipmentCount,
  loading,
}: LandingServicesProps) {
  const displayServices = services.filter(
    (s) =>
      s.enabled &&
      s.href !== '/' &&
      !s.href.startsWith('/history') &&
      !s.href.startsWith('/account') &&
      !s.href.startsWith('/notifications'),
  );

  return (
    <section
      id="services"
      className="px-4 py-12 sm:px-6 md:py-16 bg-ground border-y border-line"
    >
      <div className="max-w-7xl mx-auto">
        <ScrollReveal className="max-w-2xl mb-8">
          <div className="text-caption font-semibold text-brand-ink uppercase tracking-wider">
            Core Services
          </div>
          <h2 className="text-title md:text-display font-bold text-ink mt-1">
            บริการหลักที่ขับเคลื่อนทุกคำขอ
          </h2>
        </ScrollReveal>

        {loading ? (
          <div className="grid md:grid-cols-3 gap-5" aria-busy="true">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="h-52 rounded-card bg-surface border border-line animate-pulse"
              />
            ))}
          </div>
        ) : displayServices.length === 0 ? (
          <div className="rounded-card bg-surface border border-line p-8 text-center space-y-2">
            <div className="text-heading font-bold text-ink">
              ยังไม่มีบริการสาธารณะที่เปิดใช้งานในขณะนี้
            </div>
            <p className="text-body text-ink-mute">
              ผู้ดูแลระบบสามารถเปิดใช้งานและกำหนดเมนูบริการได้จากหน้าจัดการบริการ
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-5">
            {displayServices.map((service, index) => {
              const visual = getServiceVisual(service.href);
              const IconComponent = visual.icon;
              return (
                <ScrollReveal key={service.id} delayMs={(index % 3) * 100}>
                  <div className="landing-sleek-card h-full rounded-card bg-surface border border-line p-6 flex flex-col justify-between gap-4">
                    <div className="space-y-3.5">
                      <div
                        className={[
                          'w-12 h-12 rounded-control flex items-center justify-center',
                          visual.badgeClass,
                        ].join(' ')}
                      >
                        <IconComponent className="size-6" />
                      </div>
                      <h3 className="text-heading font-bold text-ink">
                        {service.label}
                      </h3>
                      <p className="text-caption leading-relaxed text-ink-mute">
                        {service.description ||
                          'ยื่นคำขอออนไลน์ ติดตามสถานะการอนุมัติ และรับเอกสารดิจิทัลได้ทันที'}
                      </p>
                    </div>

                    <div className="pt-3 flex items-center justify-between border-t border-line">
                      <span className="text-caption font-semibold text-brand-ink">
                        {getLiveCountText(
                          service.href,
                          venuesCount,
                          equipmentCount,
                        )}
                      </span>
                      <Link
                        href={`/login?redirect=${encodeURIComponent(service.href)}`}
                        className="inline-flex items-center gap-1 text-caption font-bold text-ink hover:text-brand-ink transition-colors"
                      >
                        <span>เข้าใช้งาน</span>
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
