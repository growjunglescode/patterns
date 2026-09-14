import { Suspense } from "react";
import ReviewClient from "./ReviewClient";

export default function ReviewPage() {
  return (
    <Suspense fallback={<p className="text-ink/45">Loading review…</p>}>
      <ReviewClient />
    </Suspense>
  );
}
