import * as argon2 from 'argon2';

/**
 * ฟังก์ชันสำหรับการ Hash รหัสผ่าน หรือรหัส PIN ด้วยอัลกอริทึม argon2id
 * มีความปลอดภัยระดับสูง ป้องกันการโจมตีแบบ Brute-force และ GPU Cracking
 * @param secret ข้อความ Plaintext ที่ต้องการ Hash (รหัสผ่าน หรือ PIN)
 * @returns สตริง Hash ในรูปแบบ Argon2id ($argon2id$...)
 */
export async function hashSecret(secret: string): Promise<string> {
  // ทำการ Hash ข้อมูลด้วยมาตรฐาน Argon2id
  return argon2.hash(secret, {
    type: argon2.argon2id,
  });
}

/**
 * ฟังก์ชันตรวจสอบความถูกต้องของรหัสผ่าน หรือ PIN เทียบกับค่า Hash ที่บันทึกไว้ในฐานข้อมูล
 * @param hashed ค่าสตริงที่ Hash ไว้ในฐานข้อมูล (ต้องขึ้นต้นด้วย $argon2)
 * @param secret ค่ารหัสผ่าน Plaintext ที่ผู้ใช้กรอกเข้ามา
 * @returns คืนค่า true หากรหัสผ่านถูกต้องตรงกัน, false หากไม่ถูกต้องหรือรูปแบบไม่สมบูรณ์
 */
export async function verifySecret(hashed: string | null | undefined, secret: string): Promise<boolean> {
  // หากไม่มีค่า Hash หรือไม่มีค่า secret หรือสตริง Hash ไม่ได้อยู่ในรูปแบบ argon2 ให้ปฏิเสธทันที
  if (!hashed || !secret || !hashed.startsWith('$argon2')) return false;
  try {
    // เปรียบเทียบรหัสผ่านด้วย argon2.verify อย่างปลอดภัย
    return await argon2.verify(hashed, secret);
  } catch {
    // หากเกิดข้อผิดพลาดในการประมวลผล ให้คืนค่า false เพื่อความปลอดภัย
    return false;
  }
}
