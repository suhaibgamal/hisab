export default function Modal({ isOpen, onClose, title, children, footer }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
      >
        <div className="p-6 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
          <h3 className="text-2xl font-bold text-white">{title}</h3>
        </div>
        <div className="p-6 flex-1">{children}</div>
        {footer && (
          <div className="p-6 border-t border-gray-700 flex justify-end gap-4 sticky bottom-0 bg-gray-800 z-10">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
