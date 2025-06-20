import { supabase } from "./supabase";

// Verify a password against a stored hash using the database's verify_password function
export async function verifyPassword(password, storedHash) {
  try {
    const { data, error } = await supabase.rpc("verify_password", {
      password: password,
      hash: storedHash,
    });

    if (error) {
      console.error("Error in verify_password RPC:", error.message);
      throw new Error(`Password verification failed: ${error.message}`);
    }
    return data;
  } catch (error) {
    console.error("Exception during password verification:", error);
    // Re-throw the original error to be handled by the caller
    throw error;
  }
}
