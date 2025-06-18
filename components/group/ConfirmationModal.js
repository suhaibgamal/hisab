export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  loading,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-bold text-white mb-4">{title}</h3>
        <p className="text-gray-300 mb-6">{description}</p>
        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500"
            disabled={loading}
          >
            تراجع
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-md text-white bg-red-700 hover:bg-red-600"
            disabled={loading}
          >
            {loading ? "جاري..." : "تأكيد"}
          </button>
        </div>
      </div>
    </div>
  );
}
