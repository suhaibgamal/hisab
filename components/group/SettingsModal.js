import Modal from "./Modal";
import { formatCurrency } from "../../app/group/[groupId]/utils";

export default function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onSubmit,
  members,
  loading,
  group,
}) {
  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 rounded-lg text-white bg-gray-600 hover:bg-gray-500"
        disabled={loading}
      >
        إلغاء
      </button>
      <button
        type="submit"
        form="settingsForm"
        className="px-6 py-2 text-base font-medium text-white bg-cyan-700 rounded-lg hover:bg-cyan-800 disabled:bg-cyan-400"
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
          <div className="flex items-center gap-2 text-lg font-semibold text-cyan-400 mb-4">
            <h4>الإعدادات الأساسية</h4>
          </div>
          <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 p-4 rounded-lg space-y-4 border border-cyan-900/40">
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
              <div className="text-xs text-gray-400 mt-1">
                اسم واضح للمجموعة ليسهل تمييزها.
              </div>
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
              <div className="text-xs text-gray-400 mt-1">
                وصف مختصر عن هدف أو طبيعة المجموعة (اختياري).
              </div>
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
              </select>
              <div className="text-xs text-gray-400 mt-1">
                المجموعات الخاصة تتطلب كلمة مرور للانضمام.
              </div>
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
                minLength={settings.privacy_level === "private" ? 8 : undefined}
                placeholder={
                  settings.privacy_level === "private"
                    ? "أدخل كلمة مرور جديدة أو اتركها فارغة لإزالة كلمة المرور"
                    : "غير مطلوبة للمجموعات العامة"
                }
                disabled={settings.privacy_level !== "private"}
              />
              <div className="text-xs text-gray-400 mt-1">
                للمجموعات الخاصة فقط. اتركها فارغة لعدم التغيير أو لإزالة كلمة
                المرور.
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                العملة الموحدة
              </label>
              <div className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md cursor-not-allowed opacity-70">
                {formatCurrency(0, group.currency)}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                لا يمكن تغيير العملة بعد إنشاء المجموعة.
              </div>
            </div>
          </div>
        </div>

        {/* Member Management Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-cyan-400 mb-4">
            <h4>إدارة الأعضاء</h4>
          </div>
          <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 p-4 rounded-lg space-y-6 border border-cyan-900/40">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                الحد الأقصى للأعضاء (عدد الأعضاء الحالي: {members.length})
              </label>
              <input
                type="number"
                name="member_limit"
                value={settings.member_limit || ""}
                onChange={onSettingsChange}
                className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md"
                min={Math.max(2, members.length)}
                max={100}
              />
              <div className="text-xs text-gray-400 mt-1">
                يجب أن يكون الحد الأقصى أكبر أو يساوي عدد الأعضاء الحاليين.
              </div>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="invite_code_visible"
                name="invite_code_visible"
                checked={settings.invite_code_visible}
                onChange={onSettingsChange}
                className="h-4 w-4 text-cyan-600 rounded-lg"
              />
              <label
                htmlFor="invite_code_visible"
                className="mr-2 block text-sm text-gray-300"
              >
                إظهار رمز الدعوة للأعضاء
              </label>
              <div className="text-xs text-gray-400 mt-1">
                إذا تم تفعيل هذا الخيار، سيتمكن جميع الأعضاء من رؤية رمز الدعوة.
              </div>
            </div>
          </div>
        </div>

        {/* Privacy & Security Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-cyan-400 mb-4">
            <h4>الخصوصية والأمان</h4>
          </div>
          <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 p-4 rounded-lg space-y-4 border border-cyan-900/40">
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
              <div className="text-xs text-gray-400 mt-1">
                حدد من يمكنه الاطلاع على سجل النشاط الخاص بالمجموعة.
              </div>
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
              <div className="text-xs text-gray-400 mt-1">
                حدد من يمكنه تصدير بيانات المجموعة إلى ملف.
              </div>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
