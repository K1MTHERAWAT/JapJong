import { THAI_ADDRESS_COMPACT } from './thai-address-data';

export interface ThaiProvinceItem {
  id: string;
  nameTh: string;
}

export interface ThaiDistrictItem {
  id: string;
  provinceId: string;
  provinceName: string;
  nameTh: string;
}

export interface ThaiSubdistrictItem {
  id: string;
  districtId: string;
  districtName: string;
  provinceId: string;
  provinceName: string;
  nameTh: string;
  zipCode: string;
}

export interface ThaiAddressValidationResult {
  valid: boolean;
  provinceId?: string;
  provinceName?: string;
  districtId?: string;
  districtName?: string;
  subdistrictId?: string;
  subdistrictName?: string;
  zipCode?: string;
  province?: ThaiProvinceItem;
  district?: ThaiDistrictItem;
  subdistrict?: ThaiSubdistrictItem;
  error?: string;
}

let cachedProvinces: ThaiProvinceItem[] | null = null;

function normalizeText(value?: string | null): string {
  return (value ?? '').trim();
}

/**
 * Returns all 77 official Thai provinces sorted alphabetically in Thai.
 */
export function getThaiProvinces(): ThaiProvinceItem[] {
  if (cachedProvinces) return cachedProvinces;
  cachedProvinces = THAI_ADDRESS_COMPACT.map(([id, nameTh]) => ({
    id,
    nameTh,
  })).sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th'));
  return cachedProvinces;
}

/**
 * Finds a province tuple by ID or exact Thai name.
 */
function findProvinceTuple(provinceIdOrName?: string | null) {
  const key = normalizeText(provinceIdOrName);
  if (!key) return undefined;
  return THAI_ADDRESS_COMPACT.find(([id, nameTh]) => id === key || nameTh === key);
}

/**
 * Returns all districts belonging to the specified province (by ID or Thai name).
 */
export function getThaiDistricts(provinceIdOrName?: string | null): ThaiDistrictItem[] {
  const prov = findProvinceTuple(provinceIdOrName);
  if (!prov) return [];
  const [provinceId, provinceName, districts] = prov;
  return districts
    .map(([id, nameTh]) => ({
      id,
      provinceId,
      provinceName,
      nameTh,
    }))
    .sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th'));
}

/**
 * Returns all subdistricts belonging to the specified district (and province).
 */
export function getThaiSubdistricts(
  provinceOrDistrictIdOrName?: string | null,
  districtIdOrName?: string | null,
): ThaiSubdistrictItem[] {
  const hasTwoArgs = districtIdOrName !== undefined;
  const pKey = hasTwoArgs ? normalizeText(provinceOrDistrictIdOrName) : '';
  const dKey = hasTwoArgs
    ? normalizeText(districtIdOrName)
    : normalizeText(provinceOrDistrictIdOrName);
  if (!dKey) return [];

  const prov = pKey ? findProvinceTuple(pKey) : undefined;
  if (prov) {
    const [provinceId, provinceName, districts] = prov;
    const dist = districts.find(([id, nameTh]) => id === dKey || nameTh === dKey);
    if (!dist) return [];
    const [districtId, districtName, subdistricts] = dist;
    return subdistricts
      .map(([id, nameTh, zipCode]) => ({
        id,
        districtId,
        districtName,
        provinceId,
        provinceName,
        nameTh,
        zipCode,
      }))
      .sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th'));
  }

  // Fallback when only district ID or name is provided
  for (const [provinceId, provinceName, districts] of THAI_ADDRESS_COMPACT) {
    const dist = districts.find(([id, nameTh]) => id === dKey || nameTh === dKey);
    if (dist) {
      const [districtId, districtName, subdistricts] = dist;
      return subdistricts
        .map(([id, nameTh, zipCode]) => ({
          id,
          districtId,
          districtName,
          provinceId,
          provinceName,
          nameTh,
          zipCode,
        }))
        .sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th'));
    }
  }
  return [];
}

/**
 * Validates that the given province, district, and subdistrict exist and match
 * the official 3-level hierarchy (Province -> District -> Subdistrict).
 */
export function validateThaiAddressHierarchy(input: {
  province?: string | null;
  district?: string | null;
  subdistrict?: string | null;
  provinceName?: string | null;
  districtName?: string | null;
  subdistrictName?: string | null;
  provinceId?: string | null;
  districtId?: string | null;
  subdistrictId?: string | null;
}): ThaiAddressValidationResult {
  const provNameInput = normalizeText(input.province) || normalizeText(input.provinceName);
  const distNameInput = normalizeText(input.district) || normalizeText(input.districtName);
  const subNameInput = normalizeText(input.subdistrict) || normalizeText(input.subdistrictName);

  const provKey = normalizeText(input.provinceId) || provNameInput;
  const distKey = normalizeText(input.districtId) || distNameInput;
  const subKey = normalizeText(input.subdistrictId) || subNameInput;

  if (!provKey) {
    return { valid: false, error: 'กรุณาเลือกจังหวัด' };
  }
  if (!distKey) {
    return { valid: false, error: 'กรุณาเลือกอำเภอ/เขต' };
  }
  if (!subKey) {
    return { valid: false, error: 'กรุณาเลือกตำบล/แขวง' };
  }

  const provByIdOrName = findProvinceTuple(provKey) || findProvinceTuple(provNameInput);
  if (!provByIdOrName) {
    return { valid: false, error: `ไม่พบข้อมูลจังหวัด "${provNameInput || provKey}" ในระบบ` };
  }
  const [provinceId, provinceName, districts] = provByIdOrName;

  // If both provinceId and province name were supplied, ensure they match the same province
  if (input.provinceId && provNameInput && provNameInput !== provinceName) {
    return { valid: false, error: 'ชื่อจังหวัดไม่ตรงกับรหัสอ้างอิงจังหวัด' };
  }

  const distTuple = districts.find(
    ([id, nameTh]) =>
      id === distKey ||
      nameTh === distKey ||
      (distNameInput && nameTh === distNameInput),
  );
  if (!distTuple) {
    return {
      valid: false,
      error: `อำเภอ/เขต "${distNameInput || distKey}" ไม่ได้อยู่ในจังหวัด${provinceName}`,
    };
  }
  const [districtId, districtName, subdistricts] = distTuple;

  if (input.districtId && distNameInput && distNameInput !== districtName) {
    return { valid: false, error: 'ชื่ออำเภอ/เขตไม่ตรงกับรหัสอ้างอิงอำเภอ' };
  }

  const subTuple = subdistricts.find(
    ([id, nameTh]) =>
      id === subKey ||
      nameTh === subKey ||
      (subNameInput && nameTh === subNameInput),
  );
  if (!subTuple) {
    return {
      valid: false,
      error: `ตำบล/แขวง "${subNameInput || subKey}" ไม่ได้อยู่ในอำเภอ/เขต${districtName} จังหวัด${provinceName}`,
    };
  }
  const [subdistrictId, subdistrictName, zipCode] = subTuple;

  if (input.subdistrictId && subNameInput && subNameInput !== subdistrictName) {
    return { valid: false, error: 'ชื่อตำบล/แขวงไม่ตรงกับรหัสอ้างอิงตำบล' };
  }

  return {
    valid: true,
    provinceId,
    provinceName,
    districtId,
    districtName,
    subdistrictId,
    subdistrictName,
    zipCode,
    province: { id: provinceId, nameTh: provinceName },
    district: { id: districtId, nameTh: districtName, provinceId, provinceName },
    subdistrict: {
      id: subdistrictId,
      nameTh: subdistrictName,
      districtId,
      districtName,
      provinceId,
      provinceName,
      zipCode,
    },
  };
}

