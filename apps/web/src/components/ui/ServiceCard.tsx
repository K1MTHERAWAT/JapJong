import React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/**
 * =====================================================================
 * การ์ดเมนูบริการประชาชน (ServiceCard Component)
 * =====================================================================
 * ใช้แสดงกล่องเมนูบริการหลัก เช่น จองสถานที่, ยืมอุปกรณ์, แจ้งซ่อม:
 * - ไอคอนขนาดใหญ่ในกล่องสีเขียวอ่อน
 * - ชื่อบริการ (Title) พร้อมข้อความบรรยาย (Description)
 * - เอฟเฟกต์ยกตัวและเปลี่ยนสีเมื่อวางเมาส์ (Hover elevation & scale)
 */

export interface ServiceCardProps {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export function ServiceCard({ href, title, description, icon: IconComponent }: ServiceCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-card border border-line bg-surface p-5 shadow-card hover:-translate-y-0.5 hover:border-brand/25 hover:shadow-md transition-all duration-200 flex flex-col justify-between gap-4"
    >
      <div className="flex flex-col gap-3">
        {/* กล่องไอคอนพร้อมเอฟเฟกต์ขยายเล็กน้อยเวลา hover */}
        <div className="size-11 rounded-control bg-brand-tint text-brand-ink flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
          <IconComponent className="size-6" />
        </div>
        <div>
          <h3 className="text-heading text-ink font-semibold group-hover:text-brand transition-colors">
            {title}
          </h3>
          <p className="text-body text-muted mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
    </Link>
  );
}
