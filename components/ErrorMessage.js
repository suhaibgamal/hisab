import Link from "next/link";

export default function ErrorMessage({ message }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2 text-red-500">حدث خطأ</h2>
        <p className="text-gray-500">{message}</p>
        <Link
          href="/"
          className="mt-4 inline-block px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          العودة للوحة التحكم
        </Link>
      </div>
    </div>
  );
}
