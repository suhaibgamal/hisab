"use client";
import { Suspense } from "react";
import ResetPasswordContent from "./ResetPasswordContent";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function ResetPasswordPageWrapper() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
