import Link from "next/link";

export default function GroupNotFound({ message }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-gradient-to-br from-gray-900 via-gray-950 to-cyan-900">
      <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40 p-8 flex flex-col items-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-20 w-20 text-cyan-400 mb-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12A9 9 0 113 12a9 9 0 0118 0z"
          />
        </svg>
        <h1 className="text-3xl font-bold mb-2 text-white">
          المجموعة غير موجودة
        </h1>
        <p className="mb-6 text-gray-400 text-lg text-center">
          {message || "عذراً، لم نعثر على هذه المجموعة أو ربما تم حذفها."}
        </p>
        <Link
          href="/"
          className="px-6 py-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700 transition font-bold shadow"
        >
          العودة للصفحة الرئيسية
        </Link>
      </div>
    </div>
  );
}
