export default function LoadingSpinner({ size = 48 }) {
  return (
    <div className="flex items-center justify-center">
      <span
        className={`inline-block animate-spin rounded-full border-4 border-cyan-500 border-t-transparent border-b-transparent border-solid`}
        style={{ width: size, height: size }}
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
