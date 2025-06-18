import { FiDollarSign } from "react-icons/fi";

function StatCard({ title, value, subtext, isCurrency = true }) {
  return (
    <div className="p-3 bg-gray-700 rounded-lg">
      <p className="text-gray-400">{title}</p>
      <p className="text-lg font-semibold">
        {isCurrency && "$"}
        {value}
      </p>
      {subtext && <p className="text-xs text-gray-400">{subtext}</p>}
    </div>
  );
}

export default function BalanceSummary({
  balances,
  currentUserDbId,
  paymentStats,
  canExportData,
  onExport,
}) {
  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">ملخص الحسابات</h2>
        {canExportData && (
          <button
            onClick={onExport}
            className="px-3 py-1 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
          >
            تصدير البيانات
          </button>
        )}
      </div>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {balances.map((member) => {
          const isCurrentUser = member.user_id === currentUserDbId;
          return (
            <div
              key={member.user_id}
              className={`p-4 rounded-lg ${
                isCurrentUser ? "border-2 border-indigo-500 " : ""
              }${
                member.balance > 0
                  ? "bg-green-900/50"
                  : member.balance < 0
                  ? "bg-red-900/50"
                  : "bg-gray-700"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold">
                  {isCurrentUser
                    ? "أنت"
                    : member.display_name || member.username || "مستخدم"}
                  {member.role === "manager" && (
                    <span className="ml-2 text-xs bg-indigo-700 text-white px-2 py-1 rounded-full">
                      مدير
                    </span>
                  )}
                  {member.role === "member" && (
                    <span className="ml-2 text-xs bg-gray-600 text-white px-2 py-1 rounded-full">
                      عضو
                    </span>
                  )}
                </p>
                {isCurrentUser && (
                  <span className="text-xs bg-indigo-500 text-white px-2 py-1 rounded-full">
                    أنت
                  </span>
                )}
              </div>
              <p
                className={`text-lg ${
                  member.balance > 0
                    ? "text-green-400"
                    : member.balance < 0
                    ? "text-red-400"
                    : "text-gray-400"
                }`}
              >
                {member.balance > 0 ? "+" : ""}
                {member.balance.toFixed(2)} $
              </p>
              {isCurrentUser && member.balance !== 0 && (
                <p className="text-sm mt-2 text-gray-400">
                  {member.balance > 0
                    ? "مستحق لك من المجموعة"
                    : "عليك للمجموعة"}
                </p>
              )}
              {member.joined_at && (
                <p className="text-sm mt-1 text-gray-400">
                  عضو منذ{" "}
                  {new Intl.DateTimeFormat("ar", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }).format(new Date(member.joined_at))}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <StatCard
          title="إجمالي ما دفعت"
          value={paymentStats.totalPaid.toFixed(2)}
          subtext="(شامل المدفوعات والتسويات)"
        />
        <StatCard
          title="إجمالي ما استلمت"
          value={paymentStats.totalReceived.toFixed(2)}
          subtext="(شامل المستحقات والتسويات)"
        />
        <div className="sm:col-span-1 col-span-2">
          <StatCard
            title="متوسط مصاريف المجموعة الشهرية"
            value={paymentStats.monthlyAverage.toFixed(2)}
            subtext="(منذ إنشاء المجموعة)"
          />
        </div>
      </div>
    </div>
  );
}
