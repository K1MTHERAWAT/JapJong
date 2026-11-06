import { api } from '@/lib/api';
import { DocumentTemplateItem } from '@japjong/shared';

export interface FormDocumentConfig {
  formTitle?: string;
  subjectText?: string;
  recipientText?: string;
  writtenAtSlot?: { id: string; fieldKey: string; label: string; width: number };
  dateDaySlot?: { id: string; fieldKey: string; label: string; width: number };
  dateMonthSlot?: { id: string; fieldKey: string; label: string; width: number };
  dateYearSlot?: { id: string; fieldKey: string; label: string; width: number };
  requesterNameSlot?: { id: string; fieldKey: string; label: string; width: number };
  positionSlot?: { id: string; fieldKey: string; label: string; width: number };
  addressNoSlot?: { id: string; fieldKey: string; label: string; width: number };
  mooSlot?: { id: string; fieldKey: string; label: string; width: number };
  subdistrictSlot?: { id: string; fieldKey: string; label: string; width: number };
  districtSlot?: { id: string; fieldKey: string; label: string; width: number };
  provinceSlot?: { id: string; fieldKey: string; label: string; width: number };
  orgSlot?: { id: string; fieldKey: string; label: string; width: number };
  purposeRows?: any[];
  customSlots?: any[];
  closingText?: string;
  logoUrl?: string | null;
  updatedAt?: string;
}

export interface FormTemplateItem {
  id: string;
  title: string;
  sub: string;
  isCustom?: boolean;
  config?: FormDocumentConfig;
  rawApiTemplate?: DocumentTemplateItem;
}

const DEFAULT_FORMS: FormTemplateItem[] = [
  {
    id: 'tpl-venue',
    title: 'แบบขอใช้สถานที่ราชการ',
    sub: 'เรื่อง ขออนุญาตใช้สถานที่ราชการ',
    isCustom: false,
  },
  {
    id: 'tpl-borrow',
    title: 'แบบคำขอยืมครุภัณฑ์ราชการ',
    sub: 'เรื่อง ขออนุญาตใช้อุปกรณ์ของทางราชการ',
    isCustom: false,
  },
  {
    id: 'tpl-vehicle',
    title: 'แบบขอใช้ยานพาหนะส่วนกลาง',
    sub: 'เรื่อง ขออนุญาตใช้ยานพาหนะส่วนกลางของทางราชการ',
    isCustom: false,
  },
  {
    id: 'tpl-repair',
    title: 'แบบแจ้งปัญหา / ซ่อมบำรุงสาธารณูปโภค',
    sub: 'แจ้งปัญหาและซ่อมบำรุงสาธารณูปโภค',
    isCustom: false,
  },
];

const STORAGE_KEY = 'japjong_custom_forms';
const CONFIGS_STORAGE_KEY = 'japjong_form_configs';

// In-memory cache
let cachedApiTemplates: FormTemplateItem[] | null = null;

function getStoredConfigs(): Record<string, FormDocumentConfig> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CONFIGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getFormTemplates(): FormTemplateItem[] {
  if (cachedApiTemplates && cachedApiTemplates.length > 0) {
    return cachedApiTemplates;
  }
  if (typeof window === 'undefined') return DEFAULT_FORMS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const customList: FormTemplateItem[] = raw ? JSON.parse(raw) : [];
    const configs = getStoredConfigs();

    const merged = [...DEFAULT_FORMS, ...customList].map((item) => {
      const savedConfig = configs[item.id] || configs[item.title];
      return savedConfig ? { ...item, config: savedConfig } : item;
    });

    return merged;
  } catch {
    return DEFAULT_FORMS;
  }
}

/**
 * ดึงรายการแบบฟอร์มเอกสารจากฐานข้อมูลจริง (PostgreSQL / NestJS API)
 * พร้อมแมปโครงสร้าง document template เข้าสู่แบบฟอร์มของระบบ
 */
export async function fetchFormTemplatesFromApi(): Promise<FormTemplateItem[]> {
  try {
    const apiTemplates = await api.listDocumentTemplates();
    if (Array.isArray(apiTemplates) && apiTemplates.length > 0) {
      const configs = getStoredConfigs();

      const mapped: FormTemplateItem[] = apiTemplates.map((t) => {
        const structure = t.structure || {};
        const isDefault = ['tpl-venue', 'tpl-borrow', 'tpl-vehicle', 'tpl-repair'].includes(t.id);
        
        // Build config from API structure
        const apiConfig: FormDocumentConfig = {
          formTitle: structure.title || t.name,
          subjectText: structure.subject,
          recipientText: structure.recipient || 'ผู้มีอำนาจอนุมัติ',
          writtenAtSlot: structure.writtenAt ? { id: 's_written_at', fieldKey: 'written_at', label: 'สถานที่เขียน', width: 240 } : undefined,
          purposeRows: Array.isArray(structure.purposeItems)
            ? structure.purposeItems.map((it: any, idx: number) => ({
                id: it.id || `row-${idx + 1}`,
                itemNum: idx + 1,
                resourceSlot: { id: `s_res_${idx + 1}`, fieldKey: 'resource_name', label: 'สถานที่/อุปกรณ์', width: 300 },
                forLabel: 'เพื่อ',
                purposeSlot: { id: `s_pur_${idx + 1}`, fieldKey: 'purpose', label: 'วัตถุประสงค์', width: 300 },
              }))
            : undefined,
          customSlots: Array.isArray(structure.customSlots) ? structure.customSlots : undefined,
          closingText: structure.closingText || 'จึงเรียนมาเพื่อพิจารณาอนุญาต',
          logoUrl: (t.settings as any)?.logoUrl || null,
          updatedAt: t.updatedAt,
        };

        const localOverride = configs[t.id] || configs[t.name];

        return {
          id: t.id,
          title: t.name,
          sub: t.description || `เรื่อง ${structure.subject || t.name}`,
          isCustom: !isDefault,
          config: localOverride || apiConfig,
          rawApiTemplate: t,
        };
      });

      cachedApiTemplates = mapped;
      return mapped;
    }
  } catch (err) {
    console.warn('API templates fetch unavailable, using local store:', err);
  }

  return getFormTemplates();
}

export function getFormTemplate(titleOrId: string): FormTemplateItem | undefined {
  const templates = getFormTemplates();
  const normalized = titleOrId.trim().toLowerCase();
  return templates.find(
    (t) => t.id.toLowerCase() === normalized || t.title.toLowerCase() === normalized
  );
}

/**
 * บันทึกแม่แบบเอกสารลงฐานข้อมูลจริง (PostgreSQL API)
 */
export async function saveTemplateToDatabase(
  title: string,
  config: FormDocumentConfig,
  category: 'venue' | 'equipment' | 'memo' | 'general' = 'venue',
): Promise<FormTemplateItem> {
  const trimmedTitle = title.trim();

  // Convert config to backend DocumentStructure format
  const structure: any = {
    title: trimmedTitle,
    writtenAt: config.writtenAtSlot?.label || 'ที่ทำการองค์การบริหารส่วนตำบล',
    writtenDate: '',
    subject: config.subjectText || `ขออนุญาต${trimmedTitle}`,
    recipient: config.recipientText || 'ผู้มีอำนาจอนุมัติ',
    requesterClause: 'ข้าพเจ้า',
    requesterSlots: [
      { id: 's_req_name', label: config.requesterNameSlot?.label || 'ชื่อ-นามสกุลผู้ขอ', width: config.requesterNameSlot?.width || 260, binding: 'requester.name' },
      { id: 's_req_pos', label: config.positionSlot?.label || 'ตำแหน่ง', width: config.positionSlot?.width || 230, binding: 'requester.position' },
      { id: 's_req_org', label: config.orgSlot?.label || 'หน่วยงาน/สังกัด', width: config.orgSlot?.width || 200, binding: 'requester.organization' },
    ],
    purposeText: 'มีความประสงค์ขออนุญาต ดังนี้',
    purposeItems: (config.purposeRows || []).map((r, idx) => ({
      id: r.id || `p${idx + 1}`,
      target: '',
      purpose: '',
    })),
    closingText: config.closingText || 'จึงเรียนมาเพื่อพิจารณาอนุญาต',
    signatures: [
      { id: 'sig1', role: 'requester', title: 'ผู้ยื่นคำขอ' },
      { id: 'sig2', role: 'staff', title: 'เจ้าหน้าที่ผู้ตรวจสอบ' },
      { id: 'sig3', role: 'approver_l2', title: 'ผู้อนุมัติระดับ 2 (ปลัด อบต.)' },
      { id: 'sig4', role: 'approver_l1', title: 'ผู้อนุมัติระดับ 1 (นายก อบต.)' },
    ],
    customSlots: config.customSlots || [],
  };

  const settings: any = {
    paperSize: 'A4',
    orientation: 'portrait',
    fontFamily: 'TH Sarabun New',
    fontSize: 16,
    margins: { top: 25, bottom: 25, left: 25, right: 20 },
    logoUrl: config.logoUrl || undefined,
  };

  try {
    // Check if template already exists on API
    const existingList = await api.listDocumentTemplates().catch(() => []);
    const matched = existingList.find(
      (t) => t.name.trim().toLowerCase() === trimmedTitle.toLowerCase()
    );

    let apiResult: DocumentTemplateItem;
    if (matched) {
      apiResult = await api.updateDocumentTemplate(matched.id, {
        name: trimmedTitle,
        category,
        structure,
        settings,
      });
      await api.publishDocumentTemplate(matched.id).catch(() => {});
    } else {
      apiResult = await api.createDocumentTemplate({
        name: trimmedTitle,
        category,
        structure,
        settings,
        status: 'published',
      });
      if (apiResult?.id) {
        await api.publishDocumentTemplate(apiResult.id).catch(() => {});
      }
    }

    // Refresh cache
    await fetchFormTemplatesFromApi().catch(() => {});
  } catch (err) {
    console.warn('Could not persist template to remote database directly, caching locally:', err);
  }

  // Always sync local cache & storage as well
  saveFormTemplateConfig(trimmedTitle, config);
  const localItem = saveNewFormTemplate(trimmedTitle, undefined, config);
  return localItem;
}

export function saveNewFormTemplate(title: string, sub?: string, config?: FormDocumentConfig): FormTemplateItem {
  const trimmedTitle = title.trim();
  const newItem: FormTemplateItem = {
    id: `custom_${Date.now()}`,
    title: trimmedTitle,
    sub: sub?.trim() || `เรื่อง ขออนุญาต${trimmedTitle} · แบบกำหนดเอง`,
    isCustom: true,
    config,
  };

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const customList: FormTemplateItem[] = raw ? JSON.parse(raw) : [];
      const existingIdx = customList.findIndex((it) => it.title === trimmedTitle);
      if (existingIdx >= 0) {
        customList[existingIdx] = { ...customList[existingIdx], ...newItem };
      } else {
        customList.push(newItem);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customList));

      if (config) {
        saveFormTemplateConfig(trimmedTitle, config);
      }
    } catch (e) {
      console.error('Failed to save custom form:', e);
    }
  }

  return newItem;
}

export function saveFormTemplateConfig(titleOrId: string, config: FormDocumentConfig): void {
  if (typeof window === 'undefined') return;
  try {
    const configs = getStoredConfigs();
    const key = titleOrId.trim();
    configs[key] = {
      ...config,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(CONFIGS_STORAGE_KEY, JSON.stringify(configs));

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const customList: FormTemplateItem[] = JSON.parse(raw);
      const updatedList = customList.map((item) => {
        if (item.title === key || item.id === key) {
          return { ...item, config: configs[key] };
        }
        return item;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    }
  } catch (e) {
    console.error('Failed to save form template config:', e);
  }
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
