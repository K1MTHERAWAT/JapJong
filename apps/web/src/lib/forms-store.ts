export interface FormTemplateItem {
  id: string;
  title: string;
  sub: string;
  isCustom?: boolean;
}

const DEFAULT_FORMS: FormTemplateItem[] = [
  {
    id: 'venue',
    title: 'แบบขอใช้สถานที่ราชการ',
    sub: 'เรื่อง ขออนุญาตใช้สถานที่ราชการ · อนุมัติ 3 ระดับ',
    isCustom: false,
  },
  {
    id: 'borrow',
    title: 'แบบคำขอยืมครุภัณฑ์ราชการ',
    sub: 'เรื่อง ขออนุญาตใช้อุปกรณ์ของทางราชการ · อนุมัติ 3 ระดับ · สร้าง PDF อัตโนมัติ',
    isCustom: false,
  },
  {
    id: 'vehicle',
    title: 'แบบขอใช้ยานพาหนะส่วนกลาง',
    sub: 'เรื่อง ขออนุญาตใช้ยานพาหนะส่วนกลางของทางราชการ · อนุมัติ 3 ระดับ',
    isCustom: false,
  },
  {
    id: 'repair',
    title: 'แบบแจ้งปัญหา / ซ่อมบำรุงสาธารณูปโภค',
    sub: 'แจ้งปัญหาพร้อมรูปประกอบ · เส้นเวลาติดตาม 4 ขั้นตอน',
    isCustom: false,
  },
];

const STORAGE_KEY = 'japjong_custom_forms';

export function getFormTemplates(): FormTemplateItem[] {
  if (typeof window === 'undefined') return DEFAULT_FORMS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FORMS;
    const customList: FormTemplateItem[] = JSON.parse(raw);
    return [...DEFAULT_FORMS, ...customList];
  } catch {
    return DEFAULT_FORMS;
  }
}

export function saveNewFormTemplate(title: string, sub?: string): FormTemplateItem {
  const newItem: FormTemplateItem = {
    id: `custom_${Date.now()}`,
    title: title.trim(),
    sub: sub?.trim() || `เรื่อง ขออนุญาต${title.trim()} · สร้างขึ้นใหม่`,
    isCustom: true,
  };

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const customList: FormTemplateItem[] = raw ? JSON.parse(raw) : [];
      customList.push(newItem);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customList));
    } catch (e) {
      console.error('Failed to save custom form:', e);
    }
  }

  return newItem;
}

export function deleteCustomFormTemplate(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const customList: FormTemplateItem[] = JSON.parse(raw);
    const filtered = customList.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to delete custom form:', e);
  }
}
