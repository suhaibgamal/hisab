import Link from "next/link";

export default function ErrorMessage({ message }) {
  return (
    <div className="flex items-center gap-3 bg-gradient-to-br from-gray-800 via-gray-900 to-cyan-950 border border-cyan-900/40 text-red-400 rounded-lg px-4 py-3 shadow-md">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6 text-cyan-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M21 12A9 9 0 113 12a9 9 0 0118 0z"
        />
      </svg>
      <span className="font-semibold text-base">{message}</span>
    </div>
  );
}
