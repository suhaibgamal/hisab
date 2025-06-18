import { useState, useMemo } from "react";
import {
  FiTrash2,
  FiDollarSign,
  FiUser,
  FiUsers,
  FiCalendar,
} from "react-icons/fi";

export default function PaymentsList({
  payments,
  currentUserDbId,
  currentUserRole,
  onDeletePayment,
  loading,
  getDisplayName,
}) {
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [paymentSort, setPaymentSort] = useState("newest");

  const filteredPayments = useMemo(() => {
    return payments
      .filter((payment) => {
        const payerSplit = payment.splits.find((s) => s.amount > 0);
        const beneficiarySplits = payment.splits.filter((s) => s.amount < 0);
        const isSelfPayment =
          payment.splits.length === 1 &&
          payerSplit &&
          payerSplit.user_id === currentUserDbId;

        if (paymentFilter === "paid") {
          return payerSplit && payerSplit.user_id === currentUserDbId;
        }
        if (paymentFilter === "received") {
          return (
            beneficiarySplits.some((b) => b.user_id === currentUserDbId) &&
            !isSelfPayment
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (paymentSort === "oldest") {
          return new Date(a.created_at) - new Date(b.created_at);
        }
        if (paymentSort === "amount") {
          return (b.amount || 0) - (a.amount || 0);
        }
        return new Date(b.created_at) - new Date(a.created_at);
      });
  }, [payments, paymentFilter, currentUserDbId, paymentSort]);

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-md">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <h2 className="text-2xl font-semibold">الدفعات</h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="bg-gray-700 text-sm rounded-md border-gray-600"
          >
            <option value="all">كل الدفعات ({payments.length})</option>
            <option value="paid">
              ما دفعته (
              {
                payments.filter(
                  (p) =>
                    p.splits.find((s) => s.amount > 0)?.user_id ===
                    currentUserDbId
                ).length
              }
              )
            </option>
            <option value="received">
              ما عليك (
              {
                payments.filter(
                  (p) =>
                    p.splits.some(
                      (s) => s.amount < 0 && s.user_id === currentUserDbId
                    ) &&
                    !(
                      p.splits.length === 1 &&
                      p.splits[0].user_id === currentUserDbId
                    )
                ).length
              }
              )
            </option>
          </select>
          <select
            value={paymentSort}
            onChange={(e) => setPaymentSort(e.target.value)}
            className="bg-gray-700 text-sm rounded-md border-gray-600"
          >
            <option value="newest">الأحدث</option>
            <option value="oldest">الأقدم</option>
            <option value="amount">حسب المبلغ</option>
          </select>
        </div>
      </div>
      {filteredPayments.length > 0 ? (
        <>
          <ul className="mt-4 space-y-4">
            {(showAllPayments
              ? filteredPayments
              : filteredPayments.slice(0, 3)
            ).map((payment, index) => (
              <li
                key={`${payment.id}-${index}`}
                className={`p-4 bg-gray-900/50 rounded-md space-y-3 ${
                  payment.status === "voided" ? "opacity-50" : ""
                }`}
              >
                <div className="flex justify-between items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <p className="font-bold text-lg">{payment.description}</p>
                    {payment.status === "voided" && (
                      <span className="text-xs bg-red-700/50 text-red-200 px-2 py-1 rounded-full w-fit">
                        ملغاة
                      </span>
                    )}
                    {payment.splits.length === 1 &&
                      payment.splits[0].amount > 0 &&
                      payment.splits[0].user_id === currentUserDbId && (
                        <span className="text-xs bg-yellow-600/50 text-yellow-200 px-2 py-1 rounded-full w-fit">
                          دفعة ذاتية (لنفسك فقط)
                        </span>
                      )}
                  </div>
                  {(payment.payer?.id === currentUserDbId ||
                    currentUserRole === "manager") &&
                    payment.status !== "voided" && (
                      <button
                        onClick={() => onDeletePayment(payment.id)}
                        disabled={loading}
                        className="text-red-500 hover:text-red-400 disabled:text-gray-500"
                        aria-label="Delete payment"
                      >
                        <FiTrash2 className="h-5 w-5" />
                      </button>
                    )}
                </div>

                <div className="space-y-2 text-gray-300">
                  <div className="flex items-center gap-2">
                    <FiDollarSign className="h-5 w-5 text-indigo-400" />
                    <span className="font-semibold text-white">
                      ${parseFloat(payment.amount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FiUser className="h-5 w-5 text-indigo-400" />
                    <span>{getDisplayName(payment.payer)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FiCalendar className="h-5 w-5 text-indigo-400" />
                    <span>
                      {new Date(payment.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <FiUsers className="h-5 w-5 mt-0.5 text-indigo-400" />
                    <span className="flex-1">
                      المستفيدون:{" "}
                      {payment.splits.filter((s) => s.amount < 0).length === 0
                        ? "لا يوجد مستفيدون آخرون"
                        : payment.splits
                            .filter((s) => s.amount < 0)
                            .map((s) => s.user)
                            .filter(
                              (u, i, arr) =>
                                arr.findIndex(
                                  (x) => x && u && x.id === u.id
                                ) === i
                            )
                            .map((beneficiary, index, array) => (
                              <span key={beneficiary.id}>
                                {getDisplayName(beneficiary)}
                                {index < array.length - 1 ? ", " : ""}
                              </span>
                            ))}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {filteredPayments.length > 3 && (
            <button
              onClick={() => setShowAllPayments(!showAllPayments)}
              className="mt-4 w-full text-center text-indigo-400 hover:underline"
            >
              {showAllPayments ? "إظهار أقل" : "إظهار الكل"}
            </button>
          )}
        </>
      ) : (
        <p className="mt-4 text-gray-400">
          لم تتم إضافة أي دفعات لهذه المجموعة بعد.
        </p>
      )}
    </div>
  );
}
