export default function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600 mb-4"></div>
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">جاري تحميل المجموعة...</h2>
        <p className="text-gray-500">يرجى الانتظار قليلاً</p>
      </div>
    </div>
  );
}
