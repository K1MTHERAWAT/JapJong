import React from 'react';

/**
 * =====================================================================
 * ตารางข้อมูลมาตรฐานระบบราชการ (Table Component Primitives)
 * =====================================================================
 * อ้างอิงแนวทางจาก GOV Components Library:
 * - ความสูงแถวและระยะ Padding สม่ำเสมอ อ่านง่ายบน Desktop
 * - หัวตาราง (thead) ใช้พื้นหลัง `bg-surface-muted/80` พร้อมตัวอักษร `text-ink-soft`
 * - แถวข้อมูล (tbody tr) มีสถานะ Hover นุ่มนวลด้วย `hover:bg-brand-tint/25`
 */

export function TableContainer({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`jw-table-wrap ${className}`} {...props}>
      {children}
    </div>
  );
}

export function Table({
  className = '',
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={`jw-table ${className}`} {...props}>
      {children}
    </table>
  );
}

export function TableHead({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={className} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={className} {...props}>
      {children}
    </tr>
  );
}

export function TableHeaderCell({
  className = '',
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={className} {...props}>
      {children}
    </th>
  );
}

export function TableCell({
  className = '',
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={className} {...props}>
      {children}
    </td>
  );
}
