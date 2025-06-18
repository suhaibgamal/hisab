export default function LoadingSpinner() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen p-4"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-16 w-16 mb-4">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-16 w-16 border-4 border-indigo-600 border-t-transparent animate-spin"></span>
      </span>
      <div className="text-center">
        <span className="text-lg font-medium text-indigo-500">
          جاري التحميل...
        </span>
      </div>
    </div>
  );
}
