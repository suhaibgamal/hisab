"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

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

  // Create Group Modal State
  const [isCreateGroupModalOpen, setCreateGroupModalOpen] = useState(false);
  const [newGroupPassword, setNewGroupPassword] = useState("");
  const [isGroupPrivate, setIsGroupPrivate] = useState(false);
  const [description, setDescription] = useState("");
  const [memberLimit, setMemberLimit] = useState(10); // Changed default to 10
  const [inviteCodeVisible, setInviteCodeVisible] = useState(true);
  const [autoApproveMembers, setAutoApproveMembers] = useState(true);
  const [activityLogPrivacy, setActivityLogPrivacy] = useState("all");
  const [exportControl, setExportControl] = useState("all");

  // Private Group Join Modal State
  const [isJoinPrivateModalOpen, setJoinPrivateModalOpen] = useState(false);
  const [privateGroupDetails, setPrivateGroupDetails] = useState(null);
  const [privateGroupPassword, setPrivateGroupPassword] = useState("");

  // Add new state for password
  const [privateGroupPasswordHash, setPrivateGroupPasswordHash] = useState("");

  const router = useRouter();

  // PBKDF2 parameters - explicitly defined
  const PBKDF2_CONFIG = {
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: 100000,
    outputBits: 256,
  };

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
    const storedUser = localStorage.getItem("hisab_user");
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      fetchUserAndGroups(parsedUser.id);
    }
    setLoading(false);
  }, [fetchUserAndGroups]);

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
      toast.error("الرجاء إدخال اسم المجموعة");
      return;
    }

    // Validate group name
    if (newGroupName.length < 3 || newGroupName.length > 50) {
      toast.error("اسم المجموعة يجب أن يكون بين 3 و 50 حرف");
      return;
    }

    // Validate description
    if (description && description.length > 500) {
      toast.error("وصف المجموعة يجب أن لا يتجاوز 500 حرف");
      return;
    }

    if (isGroupPrivate && !newGroupPassword) {
      toast.error("الرجاء إدخال كلمة مرور للمجموعة");
      return;
    }

    // Validate member limit
    const limit = parseInt(memberLimit);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      toast.error("الحد الأقصى للأعضاء يجب أن يكون بين 1 و 100");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const { error } = await supabase.functions.invoke("create-group", {
        body: {
          name: newGroupName.trim(),
          password: isGroupPrivate ? newGroupPassword : null,
          user_id: user.id,
          user_display_name: user.display_name || user.username || "مستخدم",
          description: description.trim(),
          member_limit: limit,
          invite_code_visible: inviteCodeVisible,
          auto_approve_members: autoApproveMembers,
          activity_log_privacy: activityLogPrivacy,
          export_control: exportControl,
        },
      });

      if (error) throw error;

      // Reset form state
      setNewGroupName("");
      setIsGroupPrivate(false);
      setNewGroupPassword("");
      setDescription("");
      setMemberLimit(10); // Reset to default value
      setInviteCodeVisible(true);
      setAutoApproveMembers(true);
      setActivityLogPrivacy("all");
      setExportControl("all");
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
      const { data } = await supabase.functions.invoke("join-group", {
        body: { group_code: inviteCode.trim() },
      });

      // Check if it's a private group
      if (data?.is_private) {
        setPrivateGroupDetails({
          id: data.group_id,
          name: data.group_name,
        });
        setPrivateGroupPasswordHash(data.password_hash);
        setJoinPrivateModalOpen(true);
        setInviteCode(""); // Clear the invite code
        setLoading(false);
        return;
      }

      // If we get here, it means it's a successful join of a public group
      toast.success("Successfully joined the group!");
      await fetchUserAndGroups(user.id);
      setInviteCode("");

      // Redirect to group page after successful join
      if (data.group_id) {
        router.push(`/group/${data.group_id}`);
      }
    } catch (err) {
      console.error("Error joining group:", err);
      const errorMessage = err.data?.error || err.message;
      const errorDetails = err.data?.details;
      setError(
        errorDetails
          ? `${errorMessage}: ${errorDetails}`
          : errorMessage || "Failed to join the group."
      );
      toast.error(
        errorDetails
          ? `${errorMessage}: ${errorDetails}`
          : errorMessage || "Failed to join the group."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleJoinPrivateGroup = async (e) => {
    e.preventDefault();
    if (
      !privateGroupPassword.trim() ||
      !privateGroupDetails ||
      !privateGroupPasswordHash
    ) {
      toast.error("Please enter the group password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      console.log("[Debug] Attempting to join private group");
      console.log("[Debug] Group ID:", privateGroupDetails.id);

      // First verify password locally
      const isValidPassword = await verifyPassword(
        privateGroupPassword.trim(),
        privateGroupPasswordHash
      );

      if (!isValidPassword) {
        setError("كلمة المرور غير صحيحة");
        toast.error("كلمة المرور غير صحيحة");
        setLoading(false);
        return;
      }

      // If password is correct, join the group
      const { data, error } = await supabase.functions.invoke("join-group", {
        body: {
          group_id: privateGroupDetails.id,
          password: privateGroupPassword.trim(),
        },
      });

      if (error) throw error;

      // If we get here, it means successful join
      toast.success(data.message || "Successfully joined the group!");
      await fetchUserAndGroups(user.id);
      setJoinPrivateModalOpen(false);
      setPrivateGroupPassword("");
      setPrivateGroupDetails(null);
      setPrivateGroupPasswordHash("");

      // Redirect to group page
      router.push(`/group/${privateGroupDetails.id}`);
    } catch (err) {
      console.error("[Debug] Error joining private group:", err);
      const errorMessage = err.data?.error || err.message;
      const errorDetails = err.data?.details;
      setError(
        errorDetails
          ? `${errorMessage}: ${errorDetails}`
          : errorMessage || "Failed to join the group."
      );
      toast.error(
        errorDetails
          ? `${errorMessage}: ${errorDetails}`
          : errorMessage || "Failed to join the group."
      );
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

  // Convert base64url to Uint8Array with proper padding
  const toUint8Array = (b64url) => {
    console.log("[Debug] Converting base64url to Uint8Array:", b64url);
    const b64 =
      b64url.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (b64url.length % 4)) % 4);
    console.log("[Debug] After base64 conversion:", b64);
    const bin = atob(b64);
    const arr = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    console.log("[Debug] Resulting array length:", arr.length);
    return arr;
  };

  // Convert Uint8Array to base64url
  const toBase64url = (buffer) => {
    console.log(
      "[Debug] Converting Uint8Array to base64url, length:",
      buffer.length
    );
    const bin = String.fromCharCode(...new Uint8Array(buffer));
    const b64 = btoa(bin);
    console.log("[Debug] Initial base64:", b64);
    const b64url = b64
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    console.log("[Debug] Final base64url:", b64url);
    return b64url;
  };

  // Verify a password against a stored hash
  const verifyPassword = async (password, storedHash) => {
    try {
      console.log("=== Password Verification Debug ===");
      console.log("[Debug] PBKDF2 Configuration:", PBKDF2_CONFIG);
      console.log("[Debug] Entered password:", password);
      console.log("[Debug] Stored password hash:", storedHash);

      const [saltB64url, keyB64url] = storedHash.split(":");
      if (!saltB64url || !keyB64url) {
        console.log("[Debug] Error: Invalid hash format");
        return false;
      }

      console.log("[Debug] Salt (base64url):", saltB64url);
      console.log("[Debug] Expected key (base64url):", keyB64url);

      const salt = toUint8Array(saltB64url);
      const storedKey = toUint8Array(keyB64url);
      const passwordBytes = new TextEncoder().encode(password);

      console.log("[Debug] Salt bytes:", Array.from(salt));
      console.log("[Debug] Stored key bytes:", Array.from(storedKey));
      console.log("[Debug] Password bytes:", Array.from(passwordBytes));

      console.log("[Debug] Importing key with params:", {
        raw: Array.from(passwordBytes),
        algorithm: "PBKDF2",
        extractable: false,
        usages: ["deriveBits"],
      });

      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        passwordBytes,
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
      );

      console.log("[Debug] Key material imported successfully");
      console.log("[Debug] Deriving bits with params:", {
        name: PBKDF2_CONFIG.name,
        hash: PBKDF2_CONFIG.hash,
        salt: Array.from(salt),
        iterations: PBKDF2_CONFIG.iterations,
      });

      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: PBKDF2_CONFIG.name,
          hash: PBKDF2_CONFIG.hash,
          salt,
          iterations: PBKDF2_CONFIG.iterations,
        },
        keyMaterial,
        PBKDF2_CONFIG.outputBits
      );

      const derivedKey = new Uint8Array(derivedBits);
      const derivedKeyBase64url = toBase64url(derivedKey);

      console.log("[Debug] Comparison:");
      console.log("- Derived key length:", derivedKey.length, "bytes");
      console.log("- Derived key bytes:", Array.from(derivedKey));
      console.log("- Derived key (base64url):", derivedKeyBase64url);
      console.log("- Expected key (base64url):", keyB64url);
      console.log("- Keys match?", derivedKeyBase64url === keyB64url);

      // Constant time comparison
      if (derivedKey.length !== storedKey.length) {
        console.log("[Debug] Key lengths don't match");
        return false;
      }

      let result = true;
      for (let i = 0; i < derivedKey.length; i++) {
        if (derivedKey[i] !== storedKey[i]) {
          console.log(
            `[Debug] Mismatch at byte ${i}: ${derivedKey[i]} !== ${storedKey[i]}`
          );
          result = false;
        }
      }

      console.log("[Debug] Final verification result:", result);
      return result;
    } catch (error) {
      console.error("[Debug] Error verifying password:", error);
      return false;
    }
  };

  // Test specific password and salt combination
  const testPasswordDerivation = async () => {
    console.log("=== Password Derivation Test ===");
    const testPassword = "123456";
    const testHash =
      "p2abCLyrYS-BvMsEU_hSRg:cAyQRrP88Kw1LjoBToPVljwR52wpyx8ZsgWqM4ciE3g";

    console.log("[Test] Test vector:");
    console.log("- Password:", testPassword);
    console.log("- Hash:", testHash);

    const result = await verifyPassword(testPassword, testHash);
    console.log("[Test] Final result:", result);
    return result;
  };

  // Run the test when component mounts
  useEffect(() => {
    testPasswordDerivation();
  }, []);

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
        <div className="w-full max-w-4xl">
          <header className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
            <h1 className="text-3xl sm:text-4xl font-bold">
              أهلاً بك، <span className="font-bold">{user.display_name}</span>!
            </h1>
            <button
              onClick={handleLogout}
              className="text-indigo-400 hover:underline"
              disabled={authLoading}
            >
              {authLoading ? "جاري..." : "تسجيل الخروج"}
            </button>
          </header>

          <section className="mb-8 p-6 bg-gray-800 rounded-lg shadow-md">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h2 className="text-2xl font-semibold mb-4">
                  إنشاء مجموعة جديدة
                </h2>
                <button
                  onClick={() => setCreateGroupModalOpen(true)}
                  disabled={loading}
                  className="w-full px-6 py-3 text-base font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
                >
                  {loading ? "..." : "إنشاء مجموعة جديدة"}
                </button>
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
            {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">مجموعاتك</h2>
            {loadingGroups ? (
              <p>جاري تحميل المجموعات...</p>
            ) : groups.length > 0 ? (
              <ul className="space-y-4">
                {groups.map((group) => (
                  <li key={group.id}>
                    <Link
                      href={`/group/${group.id}`}
                      className="block p-4 bg-gray-800 rounded-lg shadow hover:bg-gray-700 transition-colors"
                    >
                      <p className="font-semibold text-lg">{group.name}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-gray-400 py-4">
                أنت لست عضواً في أي مجموعة حتى الآن.
              </p>
            )}
          </section>
        </div>
        {isCreateGroupModalOpen && (
          <div className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-2xl font-bold text-white mb-6">
                إعدادات المجموعة الجديدة
              </h3>
              <form onSubmit={handleCreateGroup} className="space-y-6">
                {/* Basic Settings */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-lg font-semibold text-indigo-400 mb-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <h4>الإعدادات الأساسية</h4>
                  </div>
                  <div className="bg-gray-700/50 p-4 rounded-lg space-y-4">
                    <div>
                      <label
                        htmlFor="newGroupName"
                        className="block text-sm font-medium text-gray-300 mb-1"
                      >
                        اسم المجموعة
                      </label>
                      <input
                        id="newGroupName"
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="مثال: رحلة الشمال"
                        className="w-full px-3 py-2 bg-gray-700 text-gray-200 placeholder-gray-400 border border-gray-600 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        required
                        minLength={3}
                        maxLength={50}
                        pattern="[^<>]*"
                      />
                      <p className="mt-1 text-sm text-gray-400">
                        بين 3 و 50 حرف
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="description"
                        className="block text-sm font-medium text-gray-300 mb-1"
                      >
                        وصف المجموعة
                      </label>
                      <textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="وصف اختياري للمجموعة"
                        className="w-full px-3 py-2 bg-gray-700 text-gray-200 placeholder-gray-400 border border-gray-600 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        rows="3"
                        maxLength={500}
                      />
                      <p className="mt-1 text-sm text-gray-400">
                        {500 - (description?.length || 0)} حرف متبقي
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="newGroupPassword"
                        className="block text-sm font-medium text-gray-300 mb-1"
                      >
                        كلمة المرور
                      </label>
                      <input
                        id="newGroupPassword"
                        type="password"
                        value={newGroupPassword}
                        onChange={(e) => setNewGroupPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 bg-gray-700 text-gray-200 placeholder-gray-400 border border-gray-600 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        minLength={6}
                        maxLength={50}
                        pattern="[^<>]*"
                      />
                      <p className="mt-1 text-sm text-gray-400">
                        اتركها فارغة لجعل المجموعة عامة
                      </p>
                    </div>
                  </div>
                </div>

                {/* Member Management Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-lg font-semibold text-indigo-400 mb-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                    </svg>
                    <h4>إدارة الأعضاء</h4>
                  </div>
                  <div className="bg-gray-700/50 p-4 rounded-lg space-y-6">
                    <div>
                      <label
                        htmlFor="memberLimit"
                        className="block text-sm font-medium text-gray-300 mb-1"
                      >
                        الحد الأقصى للأعضاء
                      </label>
                      <input
                        id="memberLimit"
                        type="number"
                        min="1"
                        max="100"
                        value={memberLimit}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          setMemberLimit(
                            isNaN(value)
                              ? 10
                              : Math.max(1, Math.min(100, value))
                          );
                        }}
                        className="w-full px-3 py-2 bg-gray-700 text-gray-200 placeholder-gray-400 border border-gray-600 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        required
                      />
                      <p className="mt-1 text-sm text-gray-400">
                        بين 1 و 100 عضو
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="invite_code_visible"
                          checked={inviteCodeVisible}
                          onChange={(e) =>
                            setInviteCodeVisible(e.target.checked)
                          }
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label
                          htmlFor="invite_code_visible"
                          className="mr-2 block text-sm text-gray-300"
                        >
                          إظهار رمز الدعوة
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="auto_approve_members"
                          checked={autoApproveMembers}
                          onChange={(e) =>
                            setAutoApproveMembers(e.target.checked)
                          }
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label
                          htmlFor="auto_approve_members"
                          className="mr-2 block text-sm text-gray-300"
                        >
                          قبول الأعضاء تلقائياً
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Privacy & Security Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-lg font-semibold text-indigo-400 mb-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <h4>الخصوصية والأمان</h4>
                  </div>
                  <div className="bg-gray-700/50 p-4 rounded-lg space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        خصوصية سجل النشاط
                      </label>
                      <select
                        value={activityLogPrivacy}
                        onChange={(e) => setActivityLogPrivacy(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="all">الكل</option>
                        <option value="managers">المديرون فقط</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        التحكم في تصدير البيانات
                      </label>
                      <select
                        value={exportControl}
                        onChange={(e) => setExportControl(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="all">الكل</option>
                        <option value="managers">المديرون فقط</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => setCreateGroupModalOpen(false)}
                    className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500"
                    disabled={loading}
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 text-base font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
                    disabled={loading}
                  >
                    {loading ? "جاري الإنشاء..." : "إنشاء المجموعة"}
                  </button>
                </div>

                {error && (
                  <p className="text-red-400 mt-2 text-center">{error}</p>
                )}
              </form>
            </div>
          </div>
        )}
        {isJoinPrivateModalOpen && (
          <div className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
              <h3 className="text-2xl font-bold text-white mb-6">
                أدخل كلمة مرور مجموعة {privateGroupDetails?.name}
              </h3>
              <form onSubmit={handleJoinPrivateGroup} className="space-y-4">
                <div>
                  <label
                    htmlFor="privateGroupPassword"
                    className="block text-sm font-medium text-gray-300 mb-1"
                  >
                    كلمة مرور المجموعة
                  </label>
                  <input
                    id="privateGroupPassword"
                    type="password"
                    value={privateGroupPassword}
                    onChange={(e) => setPrivateGroupPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور"
                    className="w-full px-3 py-2 bg-gray-700 text-gray-200 placeholder-gray-400 border border-gray-600 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>

                {error && (
                  <p className="text-red-400 mt-2 text-center">{error}</p>
                )}

                <div className="flex justify-end gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setJoinPrivateModalOpen(false);
                      setPrivateGroupPassword("");
                      setPrivateGroupDetails(null);
                      setPrivateGroupPasswordHash("");
                      setError("");
                    }}
                    className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500"
                    disabled={loading}
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 text-base font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
                    disabled={loading}
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
