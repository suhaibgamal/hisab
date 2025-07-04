import { useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "../../app/group/[groupId]/utils";

export default function AddPaymentForm({
  members,
  user,
  group,
  onAddPayment,
  paymentLoading,
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedBeneficiaries, setSelectedBeneficiaries] = useState([]);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const handleBeneficiaryChange = (memberId) => {
    if (members.length === 1) {
      return;
    }
    setSelectedBeneficiaries((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("يرجى إدخال وصف للدفعة.");
      return;
    }
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح أكبر من صفر.");
      return;
    }
    if (
      selectedBeneficiaries.length === 0 ||
      (members.length === 1 && selectedBeneficiaries.length === 0)
    ) {
      toast.error("يرجى اختيار مستفيد واحد على الأقل.");
      return;
    }
    onAddPayment({
      description: description.trim(),
      amount,
      selectedBeneficiaries,
      paymentDate,
      onSuccess: () => {
        setDescription("");
        setAmount("");
        setSelectedBeneficiaries([]);
        setPaymentDate(new Date().toISOString().split("T")[0]);
      },
    });
  };

  return (
    <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 p-6 rounded-lg shadow-md border border-cyan-900/40">
      <h2 className="text-2xl font-semibold mb-4">إضافة دفعة جديدة</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-gray-300 mb-1"
          >
            الوصف
          </label>
          <input
            type="text"
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-gray-700 text-gray-200"
            required
            maxLength={100}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="amount"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              المبلغ
            </label>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-gray-700 text-gray-200"
              required
              step="0.01"
              min={0.01}
              max={1000000}
            />
            <span className="ml-2 text-gray-400">
              {formatCurrency(1, group.currency)
                .replace(/\d|[.,]/g, "")
                .trim() || group.currency}
            </span>
          </div>
          <div>
            <label
              htmlFor="paymentDate"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              التاريخ
            </label>
            <input
              type="date"
              id="paymentDate"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full bg-gray-700 text-gray-200"
              required
            />
          </div>
        </div>
        <div>
          <p className="block text-sm font-medium text-gray-300">
            المدفوع بواسطة
          </p>
          <p className="mt-1 text-gray-100">
            {
              members.find((m) => m.users?.supabase_auth_id === user?.id)?.users
                ?.display_name
            }
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="block text-sm font-medium text-gray-300">
              المستفيدون
            </p>
            {members.length > 1 && (
              <div className="flex items-center">
                <input
                  id="select-all-beneficiaries"
                  type="checkbox"
                  checked={selectedBeneficiaries.length === members.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedBeneficiaries(members.map((m) => m.id));
                    } else {
                      setSelectedBeneficiaries([]);
                    }
                  }}
                  className="h-4 w-4 text-cyan-500 bg-gray-600 border-gray-500 rounded-lg focus:ring-cyan-600"
                />
                <label
                  htmlFor="select-all-beneficiaries"
                  className="ms-2 text-sm text-gray-200"
                >
                  {selectedBeneficiaries.length === members.length
                    ? "إلغاء تحديد الكل"
                    : "تحديد الكل"}
                </label>
              </div>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            {members.length === 1 && selectedBeneficiaries.length === 0 ? (
              <p className="text-gray-400">لا يمكنك إضافة دفعة لنفسك فقط.</p>
            ) : (
              members
                .sort((a, b) => {
                  if (a.users?.supabase_auth_id === user?.id) return -1;
                  if (b.users?.supabase_auth_id === user?.id) return 1;
                  return 0;
                })
                .map((member) => (
                  <div key={member.id} className="flex items-center">
                    <input
                      id={`beneficiary-${member.id}`}
                      type="checkbox"
                      checked={selectedBeneficiaries.includes(member.id)}
                      onChange={() => handleBeneficiaryChange(member.id)}
                      className="h-4 w-4 text-cyan-500 bg-gray-600 border-gray-500 rounded-lg focus:ring-cyan-600"
                    />
                    <label
                      htmlFor={`beneficiary-${member.id}`}
                      className="ms-3 block text-sm text-gray-200"
                    >
                      {
                        members.find((m) => m.id === member.id)?.users
                          ?.display_name
                      }
                      {member.users?.supabase_auth_id === user?.id && " (أنت)"}
                    </label>
                  </div>
                ))
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={paymentLoading}
          className="w-full px-4 py-3 text-base font-medium text-white bg-cyan-700 rounded-lg hover:bg-cyan-800 disabled:bg-cyan-400"
        >
          {paymentLoading ? "جاري الإضافة..." : "إضافة دفعة"}
        </button>
      </form>
    </div>
  );
}
