import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-2xl mb-4">
        404
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">ไม่พบหน้าที่คุณต้องการ</h2>
      <p className="text-sm text-slate-500 max-w-sm mb-6">
        หน้าที่คุณกำลังเข้าชมอาจถูกย้าย ลบ หรือไม่เคยมีอยู่ในระบบ กรุณาตรวจสอบลิงก์อีกครั้ง
      </p>
      <Link
        href="/"
        className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
      >
        กลับสู่หน้าหลัก
      </Link>
    </div>
  );
}

