"use client";

import { useEffect, useState } from "react";
import { testPasswordHash } from "../../lib/passwordUtils";

export default function TestPage() {
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const runTest = async () => {
      try {
        const testResults = await testPasswordHash();
        setResults(testResults);
      } catch (err) {
        console.error("Test error:", err);
        setError(err.message);
      }
    };

    runTest();
  }, []);

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-500 mb-4">Test Error</h1>
        <pre className="bg-red-900/50 p-4 rounded">{error}</pre>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Running Password Tests...</h1>
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Password Hash Test Results</h1>
      <div className="space-y-4">
        <div
          className={`p-4 rounded ${
            results.newHashVerification ? "bg-green-900/50" : "bg-red-900/50"
          }`}
        >
          <h2 className="font-semibold">New Hash Verification</h2>
          <p>Result: {results.newHashVerification ? "✅ PASS" : "❌ FAIL"}</p>
        </div>

        <div
          className={`p-4 rounded ${
            results.wrongPasswordTest ? "bg-green-900/50" : "bg-red-900/50"
          }`}
        >
          <h2 className="font-semibold">Wrong Password Test</h2>
          <p>Result: {results.wrongPasswordTest ? "✅ PASS" : "❌ FAIL"}</p>
        </div>

        <div
          className={`p-4 rounded ${
            results.knownVectorTest ? "bg-green-900/50" : "bg-red-900/50"
          }`}
        >
          <h2 className="font-semibold">Known Vector Test</h2>
          <p>Result: {results.knownVectorTest ? "✅ PASS" : "❌ FAIL"}</p>
        </div>
      </div>

      <div className="mt-8">
        <p className="text-gray-400">
          Check the browser console for detailed test output.
        </p>
      </div>
    </div>
  );
}
