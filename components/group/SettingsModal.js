import Modal from "./Modal";

export default function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onSubmit,
  members,
  loading,
}) {
  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500"
        disabled={loading}
      >
        إلغاء
      </button>
      <button
        type="submit"
        form="settingsForm"
        className="px-6 py-2 text-base font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
        disabled={loading}
      >
        {loading ? "جاري الحفظ..." : "حفظ التغييرات"}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="إعدادات المجموعة"
      footer={footer}
    >
      <form id="settingsForm" onSubmit={onSubmit} className="space-y-8">
        {/* Basic Settings Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-indigo-400 mb-4">
            <h4>الإعدادات الأساسية</h4>
          </div>
          <div className="bg-gray-700/50 p-4 rounded-lg space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                اسم المجموعة
              </label>
              <input
                type="text"
                name="name"
                value={settings.name}
                onChange={onSettingsChange}
                className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md"
                required
                minLength={3}
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                وصف المجموعة
              </label>
              <textarea
                name="description"
                value={settings.description}
                onChange={onSettingsChange}
                className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md"
                rows={3}
                maxLength={500}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                مستوى الخصوصية
              </label>
              <select
                name="privacy_level"
                value={settings.privacy_level || "public"}
                onChange={onSettingsChange}
                className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md"
              >
                <option value="public">عامة</option>
                <option value="private">خاصة (بكلمة مرور)</option>
                <option value="invite_only">الدعوة فقط</option>
              </select>
            </div>
            {settings.updated_at && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  آخر تحديث
                </label>
                <div className="text-gray-400 text-sm">
                  {new Date(settings.updated_at).toLocaleString("ar-EG")}
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                كلمة المرور (اتركها فارغة لعدم التغيير أو لإزالة كلمة المرور)
              </label>
              <input
                type="password"
                name="password"
                value={settings.password}
                onChange={onSettingsChange}
                className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md"
                minLength={settings.privacy_level === "private" ? 6 : undefined}
                placeholder={
                  settings.privacy_level === "private"
                    ? "أدخل كلمة مرور جديدة أو اتركها فارغة لإزالة كلمة المرور"
                    : "غير مطلوبة للمجموعات العامة"
                }
                disabled={settings.privacy_level !== "private"}
              />
            </div>
          </div>
        </div>

        {/* Member Management Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-indigo-400 mb-4">
            <h4>إدارة الأعضاء</h4>
          </div>
          <div className="bg-gray-700/50 p-4 rounded-lg space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                الحد الأقصى للأعضاء ({members.length} حالياً)
              </label>
              <input
                type="number"
                name="member_limit"
                value={settings.member_limit || ""}
                onChange={onSettingsChange}
                className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md"
                min={members.length}
                max={100}
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="invite_code_visible"
                name="invite_code_visible"
                checked={settings.invite_code_visible}
                onChange={onSettingsChange}
                className="h-4 w-4 text-indigo-600 rounded"
              />
              <label
                htmlFor="invite_code_visible"
                className="mr-2 block text-sm text-gray-300"
              >
                إظهار رمز الدعوة للأعضاء
              </label>
            </div>
          </div>
        </div>

        {/* Privacy & Security Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-indigo-400 mb-4">
            <h4>الخصوصية والأمان</h4>
          </div>
          <div className="bg-gray-700/50 p-4 rounded-lg space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                من يمكنه رؤية سجل النشاط
              </label>
              <select
                name="activity_log_privacy"
                value={settings.activity_log_privacy}
                onChange={onSettingsChange}
                className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md"
              >
                <option value="managers">المديرون فقط</option>
                <option value="all">كل الأعضاء</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                من يمكنه تصدير البيانات
              </label>
              <select
                name="export_control"
                value={settings.export_control}
                onChange={onSettingsChange}
                className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md"
              >
                <option value="managers">المديرون فقط</option>
                <option value="all">كل الأعضاء</option>
              </select>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
