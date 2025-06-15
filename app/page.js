"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { FiPlus, FiUsers } from "react-icons/fi";

export default function Home() {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [isNewUser, setIsNewUser] = useState(false); // To show/hide display name
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [joiningGroupInfo, setJoiningGroupInfo] = useState(null);

  // Create Group Modal State
  const [isCreateGroupModalOpen, setCreateGroupModalOpen] = useState(false);
  const [newGroupPassword, setNewGroupPassword] = useState("");
  const [isGroupPrivate, setIsGroupPrivate] = useState(false);

  const router = useRouter();

  const fetchUserAndGroups = useCallback(async (userId) => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoadingGroups(true);
    try {
      const { data: groupData, error: groupError } = await supabase.rpc(
        "get_groups_for_user",
        { p_user_id: userId }
      );

      if (groupError) throw groupError;
      setGroups(groupData || []);
    } catch (err) {
      console.error("Detailed error fetching groups:", {
        message: err.message,
        code: err.code,
        details: err.details,
        hint: err.hint,
        error: err,
      });
      toast.error("Session expired. Please log in again.");
      handleLogout(); // Log out user if fetching fails
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    const currentUser = localStorage.getItem("hisab_user");
    if (currentUser) {
      try {
        const parsedUser = JSON.parse(currentUser);
        setUser(parsedUser);
      } catch (err) {
        console.error("Invalid user data in localStorage:", err);
        localStorage.removeItem("hisab_user");
        router.push("/");
      }
    }
  }, [router]);

  useEffect(() => {
    if (user?.id) {
      fetchUserAndGroups(user.id);
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  const handleUsernameBlur = async () => {
    if (!username.trim()) return;
    try {
      const { data, error } = await supabase.rpc("username_exists", {
        p_username: username.trim(),
      });

      if (error) throw error;

      // data is a boolean returned from our RPC function
      if (data) {
        setIsNewUser(false); // User exists
      } else {
        setIsNewUser(true); // User does not exist, so it's a new user
      }
    } catch (err) {
      // Handle other errors if necessary
      console.error("Error checking username:", err);
      toast.error("Could not verify username.");
    }
  };

  const handleAuthAction = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error("Username and password are required.");
      return;
    }
    if (isNewUser && !displayName.trim()) {
      toast.error("Please provide a display name to create an account.");
      return;
    }
    setError("");
    setAuthLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "login-or-create-user",
        {
          body: {
            username: username.trim(),
            password,
            displayName: isNewUser ? displayName.trim() : undefined,
          },
        }
      );

      // Handle network or function invocation errors
      if (error) {
        console.error("Function invocation error:", error);
        throw new Error(`Network error: ${error.message}`);
      }

      // Handle application-specific errors returned from the function
      if (!data || data.error) {
        console.error("Function returned error:", data?.error, data?.detail);
        throw new Error(data?.detail || data?.error || "Authentication failed");
      }

      // Validate required data
      if (!data.user || !data.session?.access_token) {
        console.error("Invalid response data:", data);
        throw new Error("Invalid response from server");
      }

      const finalUser = data.user;
      const session = data.session;

      // Set the auth session
      try {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      } catch (sessionError) {
        console.error("Failed to set session:", sessionError);
        throw new Error("Failed to establish session");
      }

      // Set the username for RLS
      const { error: rlsError } = await supabase.rpc("set_current_username", {
        p_username: finalUser.username,
      });

      if (rlsError) {
        console.error("RLS error:", rlsError);
        throw new Error("Failed to set user session. Please try again.");
      }

      setUser(finalUser);
      localStorage.setItem("hisab_user", JSON.stringify(finalUser));
      await fetchUserAndGroups(finalUser.id);
      toast.success(
        isNewUser ? "Account created successfully!" : "Logged in successfully!"
      );
    } catch (err) {
      console.error("Error during authentication:", err);
      // Display a clean error message to the user
      toast.error(err.message || "An unexpected error occurred");
      setError(err.message || "An unexpected error occurred");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error signing out:", err);
    }
    localStorage.removeItem("hisab_user");
    setUser(null);
    setGroups([]);
    setDisplayName("");
    setUsername("");
    setPassword("");
    setIsNewUser(false);
    toast.success("You have been logged out.");
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim() || !user) {
      toast.error("Please enter a group name.");
      return;
    }
    if (isGroupPrivate && !newGroupPassword) {
      toast.error("Please enter a password for your private group.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const { error } = await supabase.functions.invoke("create-group", {
        body: {
          group_name: newGroupName.trim(),
          password: isGroupPrivate ? newGroupPassword : null,
          user_id: user.id,
          user_display_name: user.display_name || user.username || "مستخدم",
        },
      });

      if (error) throw error;

      // Reset form state
      setNewGroupName("");
      setIsGroupPrivate(false);
      setNewGroupPassword("");
      setCreateGroupModalOpen(false);

      fetchUserAndGroups(user.id);
    } catch (error) {
      console.error("Detailed error creating group:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        error: error,
      });
      setError(
        "Failed to create group. Please try again. " + (error.message || "")
      );
      // If the error suggests an invalid user, log them out.
      if (error.message.includes("foreign key constraint")) {
        toast.error("Your session seems to have expired. Please log in again.");
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim() || !user) {
      toast.error("Please enter an invite code.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      // First check if group exists and if it needs a password
      const { data, error } = await supabase.functions.invoke("join-group", {
        body: {
          group_code: inviteCode.trim(),
          check_only: true,
        },
      });

      if (error) {
        const errorMessage = error.data?.error || error.message;
        const errorDetails = error.data?.details;
        toast.error(
          errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage
        );
        throw error;
      }

      // If group requires password, show password modal
      if (data.requires_password) {
        setJoiningGroupInfo(data);
        setShowPasswordModal(true);
        setLoading(false);
        return;
      }

      // If no password required, join directly
      const { data: joinData, error: joinError } =
        await supabase.functions.invoke("join-group", {
          body: { group_code: inviteCode.trim() },
        });

      if (joinError) throw joinError;

      toast.success(joinData.message);
      router.push(`/group/${joinData.group_id}`);
      setInviteCode("");
    } catch (err) {
      console.error("Error joining group:", err);
      setError(err.data?.error || err.message || "Failed to join the group.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      toast.error("Please enter the group password.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("join-group", {
        body: {
          group_code: inviteCode.trim(),
          password: password.trim(),
        },
      });

      if (error) {
        const errorMessage = error.data?.error || error.message;
        const errorDetails = error.data?.details;
        toast.error(
          errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage
        );
        throw error;
      }

      toast.success(data.message);
      router.push(`/group/${data.group_id}`);
      setInviteCode("");
      setPassword("");
      setShowPasswordModal(false);
      setJoiningGroupInfo(null);
    } catch (err) {
      console.error("Error joining group:", err);
      setError(err.data?.error || err.message || "Failed to join the group.");
    } finally {
      setLoading(false);
    }
  };

  const formatError = (message) => {
    if (message.includes("instanceof ReadableStream")) {
      return "An unexpected error occurred. Please try again.";
    }
    return message;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>جاري التحميل...</p>
      </div>
    );
  }

  if (user) {
    return (
      <main className="flex flex-col items-center min-h-screen p-4 sm:p-8">
        <div className="w-full max-w-7xl">
          <section className="mb-12">
            <h1 className="text-4xl font-bold mb-4">حساب</h1>
            <p className="text-gray-400">
              نظام إدارة المصاريف المشتركة بين المجموعات
            </p>
          </section>

          <section className="bg-gray-800 rounded-lg p-6 shadow-lg">
            <div className="grid gap-8">
              <div>
                <h2 className="text-2xl font-semibold mb-4">مجموعاتك</h2>
                {groups.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {groups.map((group) => (
                      <Link
                        key={group.id}
                        href={`/group/${group.id}`}
                        className="block p-4 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-lg">
                              {group.name}
                            </h3>
                            <p className="text-sm text-gray-400">
                              {group.role === "manager"
                                ? "مدير المجموعة"
                                : "عضو"}
                            </p>
                          </div>
                          <FiUsers className="h-5 w-5 text-gray-400" />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400">
                    لم تنضم لأي مجموعة بعد. أنشئ مجموعة جديدة أو انضم لمجموعة
                    موجودة.
                  </p>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-8">
                <div>
                  <h2 className="text-2xl font-semibold mb-4">
                    إنشاء مجموعة جديدة
                  </h2>
                  <Link
                    href="/create"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  >
                    <FiPlus className="h-5 w-5" />
                    <span>إنشاء مجموعة</span>
                  </Link>
                </div>

                <div>
                  <h2 className="text-2xl font-semibold mb-4">
                    الانضمام لمجموعة
                  </h2>
                  <form
                    onSubmit={handleJoinGroup}
                    className="flex flex-col sm:flex-row gap-4"
                  >
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      placeholder="أدخل رمز الدعوة"
                      className="flex-grow px-3 py-2 bg-gray-700 text-gray-200 placeholder-gray-400 border border-gray-600 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-2 text-base font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400"
                    >
                      {loading ? "جاري الانضمام..." : "انضمام"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
            {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
          </section>
        </div>

        {/* Password Modal */}
        {showPasswordModal && joiningGroupInfo && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
              <h3 className="text-xl font-semibold mb-4">
                مجموعة خاصة: {joiningGroupInfo.group_name}
              </h3>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-300 mb-2"
                  >
                    كلمة مرور المجموعة
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md"
                    required
                  />
                </div>
                <div className="flex justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordModal(false);
                      setPassword("");
                      setJoiningGroupInfo(null);
                    }}
                    className="px-4 py-2 text-gray-300 hover:text-white"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
                  >
                    {loading ? "جاري الانضمام..." : "انضمام"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-sm p-8 space-y-6 bg-gray-800 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center">أهلاً بك في حساب</h1>
        <p className="text-center text-gray-400">أدخل بياناتك للمتابعة</p>
        {error && <p className="text-center text-red-400">{error}</p>}
        <div className="space-y-4">
          {isNewUser && (
            <div>
              <label
                htmlFor="displayName"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                اسم العرض
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-gray-700"
                placeholder="مثال: عبدالله"
              />
            </div>
          )}
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              اسم المستخدم
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              value={username}
              onChange={(e) => {
                // Prevent spaces and enforce basic format
                const value = e.target.value.replace(/\s/g, "").toLowerCase();
                setUsername(value);
              }}
              onBlur={handleUsernameBlur}
              className="w-full bg-gray-700"
              placeholder="username (no spaces)"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              كلمة المرور
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-700"
              placeholder="••••••••"
            />
          </div>
          <button
            onClick={handleAuthAction}
            disabled={authLoading}
            className="w-full px-4 py-3 text-base font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
          >
            {authLoading
              ? "جاري التحقق..."
              : isNewUser
              ? "إنشاء حساب ومتابعة"
              : "تسجيل الدخول"}
          </button>
        </div>
      </div>
    </main>
  );
}
