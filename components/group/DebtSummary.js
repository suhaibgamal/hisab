export default function DebtSummary({
  debts,
  members,
  user,
  settlementLoading,
  onInitiateSettlement,
  getDisplayName,
}) {
  if (debts.length === 0) {
    return (
      <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold mb-4">المستحقات</h2>
        <p className="text-gray-400">جميع الحسابات مسواة!</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
      <h2 className="text-2xl font-semibold mb-4">المستحقات</h2>
      <ul className="space-y-3">
        {debts.map((debt, index) => {
          const fromMember = members.find(
            (m) => m.users?.id === debt.from_user_id
          );
          const toMember = members.find((m) => m.users?.id === debt.to_user_id);
          const isCurrentUserDebtor =
            fromMember?.users?.supabase_auth_id === user?.id;

          return (
            <li
              key={`${debt.from_user_id}-${debt.to_user_id}-${index}`}
              className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-gray-700 rounded-md gap-2"
            >
              <div>
                <span className="font-bold">
                  {getDisplayName(fromMember?.users)}
                </span>{" "}
                مدين لـ{" "}
                <span className="font-bold">
                  {getDisplayName(toMember?.users)}
                </span>
                <span className="font-semibold text-lg block sm:inline sm:ms-4">
                  ${debt.amount.toFixed(2)}
                </span>
              </div>
              {isCurrentUserDebtor && (
                <button
                  onClick={() =>
                    onInitiateSettlement(debt.to_user_id, debt.amount)
                  }
                  disabled={settlementLoading}
                  className="px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed self-end sm:self-center"
                >
                  {settlementLoading ? "جاري..." : "تسجيل التسوية"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
