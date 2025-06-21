"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import LoadingSpinner from "../../components/LoadingSpinner";
import { toast } from "sonner";

export default function CreateGroupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    description: "",
    privacy: "public",
    password: "",
    member_limit: 10,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdGroup, setCreatedGroup] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || form.name.length < 3) {
      setError("اسم المجموعة يجب أن يكون 3 أحرف على الأقل.");
      return;
    }
    if (form.privacy === "private" && form.password.length < 8) {
      setError("كلمة مرور المجموعة الخاصة يجب أن تكون 8 أحرف على الأقل.");
      return;
    }
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "create-group",
        {
          body: {
            name: form.name.trim(),
            description: form.description.trim() || null,
            privacy_level: form.privacy,
            password: form.privacy === "private" ? form.password : null,
            member_limit: Number(form.member_limit) || 10,
          },
        }
      );
      if (fnError || data?.error) {
        throw new Error(
          fnError?.message || data?.error || "فشل إنشاء المجموعة."
        );
      }
      setCreatedGroup(data);
      toast.success("تم إنشاء المجموعة بنجاح!");
    } catch (err) {
      setError(err.message || "فشل إنشاء المجموعة.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (createdGroup?.invite_code) {
      await navigator.clipboard.writeText(createdGroup.invite_code);
      toast.success("تم نسخ رمز الدعوة!");
    }
  };

  if (createdGroup) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-gray-900 via-gray-950 to-cyan-900">
        <div className="w-full max-w-md p-8 bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40 text-center">
          <h1 className="text-3xl font-bold text-white mb-6">
            تم إنشاء المجموعة بنجاح!
          </h1>
          <div className="mb-4 text-lg text-cyan-300 font-semibold">
            رمز الدعوة:
          </div>
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="font-mono text-2xl bg-gray-900 px-4 py-2 rounded-lg border border-cyan-700 text-cyan-400 select-all">
              {createdGroup.invite_code}
            </span>
            <button
              onClick={handleCopy}
              className="px-3 py-2 rounded bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-lg shadow"
            >
              نسخ
            </button>
          </div>
          <button
            onClick={() => router.replace(`/group/${createdGroup.group_id}`)}
            className="w-full py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-lg shadow mt-2 mb-4"
          >
            الذهاب إلى المجموعة
          </button>
          <button
            onClick={() => router.replace("/dashboard")}
            className="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-800 text-white font-semibold text-base shadow"
          >
            العودة للوحة التحكم
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-gray-900 via-gray-950 to-cyan-900">
      <div className="w-full max-w-md p-8 bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 rounded-2xl shadow-xl border border-cyan-900/40">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">
          إنشاء مجموعة جديدة
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="اسم المجموعة"
            className="w-full px-4 py-3 rounded-lg text-lg bg-gray-800 text-white border border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            required
            minLength={3}
            maxLength={50}
          />
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="وصف المجموعة (اختياري)"
            className="w-full px-4 py-3 rounded-lg text-lg bg-gray-800 text-white border border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            maxLength={500}
          />
          <div className="flex gap-4 items-center">
            <label className="text-white font-semibold">الخصوصية:</label>
            <select
              name="privacy"
              value={form.privacy}
              onChange={handleChange}
              className="px-3 py-2 rounded bg-gray-700 text-white border border-cyan-700"
            >
              <option value="public">عامة</option>
              <option value="private">خاصة (تتطلب كلمة مرور)</option>
            </select>
          </div>
          {form.privacy === "private" && (
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="كلمة مرور المجموعة"
              className="w-full px-4 py-3 rounded-lg text-lg bg-gray-800 text-white border border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              minLength={8}
              maxLength={50}
              required
            />
          )}
          <div className="flex gap-4 items-center">
            <label className="text-white font-semibold">
              عدد الأعضاء الأقصى:
            </label>
            <input
              type="number"
              name="member_limit"
              value={form.member_limit}
              onChange={handleChange}
              min={2}
              max={100}
              className="w-24 px-2 py-2 rounded bg-gray-700 text-white border border-cyan-700"
              required
            />
          </div>
          {error && (
            <div className="text-red-400 font-semibold text-center">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-lg shadow mt-2"
            disabled={loading}
          >
            {loading ? <LoadingSpinner size={24} /> : "إنشاء المجموعة"}
          </button>
        </form>
      </div>
    </main>
  );
}
