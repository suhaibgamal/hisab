import { useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "../../app/group/[groupId]/utils";

export default function DebtSummary({
  debts,
  settlements,
  members,
  currentUserDbId,
  settlementLoading,
  actionLoading,
  onInitiateSettlement,
  onConfirmSettlement,
  onRejectSettlement,
  getDisplayName,
  group,
}) {
  const [showAllDebts, setShowAllDebts] = useState(false);
  const [showAllSettlements, setShowAllSettlements] = useState(false);
  const [loadingSettlementId, setLoadingSettlementId] = useState(null);

  const pendingSettlements = settlements.filter((s) => s.status === "pending");

  // A debt is outstanding if there isn't a pending settlement for it
  const outstandingDebts = debts.filter((debt) => {
    const isSettled = pendingSettlements.some(
      (s) =>
        (s.created_by === debt.from_user_id &&
          s.to_user_id === debt.to_user_id) ||
        (s.created_by === debt.to_user_id && s.to_user_id === debt.from_user_id)
    );
    return !isSettled;
  });

  const handleSettlementAction = async (settlementId, action, actionFn) => {
    if (loadingSettlementId) return;
    setLoadingSettlementId(settlementId);
    try {
      await actionFn(settlementId);
    } catch (error) {
      toast.error(
        `فشل في ${
          action === "confirm" ? "تأكيد" : action === "reject" ? "رفض" : action
        } التسوية: ${error.message}`
      );
    } finally {
      setLoadingSettlementId(null);
    }
  };

  const handleInitiateSettlementWithValidation = async (toUserId, amount) => {
    if (settlementLoading) return;
    try {
      if (amount <= 0) {
        throw new Error("يجب أن يكون مبلغ التسوية أكبر من صفر");
      }
      await onInitiateSettlement(toUserId, amount);
    } catch (error) {
      toast.error(`فشل بدء التسوية: ${error.message}`);
    }
  };

  const noActivity =
    pendingSettlements.length === 0 && outstandingDebts.length === 0;

  if (noActivity) {
    return (
      <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40 p-6">
        <h2 className="text-2xl font-semibold mb-4">ديون وتسويات</h2>
        <p className="text-gray-400">جميع الحسابات مسواة!</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40 p-6">
      <h2 className="text-2xl font-semibold mb-4">ديون وتسويات</h2>

      {/* Section for Pending Settlements */}
      {pendingSettlements.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-cyan-400 mb-2">
            تسويات معلقة
          </h3>
          <div className="space-y-3">
            {pendingSettlements
              .slice(0, showAllSettlements ? undefined : 3)
              .map((settlement) => {
                const fromUser = members.find(
                  (m) => m.users.id === settlement.created_by
                )?.users;
                const toUser = members.find(
                  (m) => m.users.id === settlement.to_user_id
                )?.users;
                const isCurrentUserRecipient =
                  settlement.to_user_id === currentUserDbId;
                const isLoading = loadingSettlementId === settlement.id;

                if (!fromUser || !toUser) return null;

                return (
                  <div
                    key={settlement.id}
                    className={`bg-gray-900/50 p-3 rounded-md flex justify-between items-center ${
                      isLoading ? "opacity-50" : ""
                    }`}
                  >
                    <div>
                      <p>
                        <span className="text-indigo-300">
                          {getDisplayName(fromUser)}
                        </span>
                        <span> يريد تسوية </span>
                        <span className="font-bold text-yellow-400 mx-1">
                          {formatCurrency(settlement.amount, group.currency)}
                        </span>
                        <span> مع </span>
                        <span className="text-indigo-300">
                          {getDisplayName(toUser)}
                        </span>
                      </p>
                    </div>
                    {isCurrentUserRecipient && (
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            handleSettlementAction(
                              settlement.id,
                              "confirm",
                              onConfirmSettlement
                            )
                          }
                          disabled={isLoading}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isLoading ? "..." : "تأكيد"}
                        </button>
                        <button
                          onClick={() =>
                            handleSettlementAction(
                              settlement.id,
                              "reject",
                              onRejectSettlement
                            )
                          }
                          disabled={isLoading}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isLoading ? "..." : "رفض"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            {pendingSettlements.length > 3 && (
              <button
                onClick={() => setShowAllSettlements(!showAllSettlements)}
                className="w-full text-center text-cyan-400 hover:underline mt-2"
              >
                {showAllSettlements
                  ? "عرض أقل"
                  : `عرض كل التسويات المعلقة (${pendingSettlements.length})`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Section for Outstanding Debts */}
      {outstandingDebts.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-cyan-400 mb-2">
            ديون قائمة
          </h3>
          <div className="space-y-3">
            {outstandingDebts
              .slice(0, showAllDebts ? undefined : 3)
              .map((debt) => {
                const fromUser = members.find(
                  (m) => m.users.id === debt.from_user_id
                )?.users;
                const toUser = members.find(
                  (m) => m.users.id === debt.to_user_id
                )?.users;
                const amDebtor = debt.from_user_id === currentUserDbId;

                if (!fromUser || !toUser) return null;
                const formattedAmount = Math.abs(debt.amount).toFixed(2);

                return (
                  <div
                    key={`${debt.from_user_id}-${debt.to_user_id}`}
                    className={`bg-gray-900/50 p-4 rounded-md flex justify-between items-center ${
                      settlementLoading ? "opacity-50" : ""
                    }`}
                  >
                    <div>
                      <span className="font-semibold text-indigo-300">
                        {getDisplayName(fromUser)}
                      </span>
                      <span> مدين لـ </span>
                      <span className="font-semibold text-indigo-300">
                        {getDisplayName(toUser)}
                      </span>
                      <span className="text-green-400 font-bold ml-2">
                        {formatCurrency(debt.amount, group.currency)}
                      </span>
                    </div>
                    {amDebtor && (
                      <button
                        onClick={() =>
                          handleInitiateSettlementWithValidation(
                            debt.to_user_id,
                            debt.amount
                          )
                        }
                        disabled={settlementLoading}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors"
                      >
                        {settlementLoading ? "..." : "تسوية"}
                      </button>
                    )}
                  </div>
                );
              })}
            {outstandingDebts.length > 3 && (
              <button
                onClick={() => setShowAllDebts(!showAllDebts)}
                className="w-full text-center text-cyan-400 hover:underline mt-2"
              >
                {showAllDebts
                  ? "عرض أقل"
                  : `عرض كل الديون (${outstandingDebts.length})`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
