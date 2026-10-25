import { AttestApp } from "@/components/attest-app";
import { Suspense } from "react";
export default function Page() {
  return (
    <Suspense
      fallback={<div className="loading-content">Loading workspace…</div>}
    >
      <AttestApp />
    </Suspense>
  );
}
