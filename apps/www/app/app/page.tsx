import { Suspense } from "react";
import { Dashboard } from "@/components/app/dashboard";

export default function Page() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
