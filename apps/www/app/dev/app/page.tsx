import "../../app/app.css";
import { notFound } from "next/navigation";
import { DevPreview } from "@/components/app/dev-preview";

// Design review: ?view=dashboard | dashboard-empty | chat (&phase=play | live | done) | chat-empty | settings.
// Not available in a production build.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; phase?: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const { view = "dashboard", phase = "play" } = await searchParams;
  return <DevPreview phase={phase} view={view} />;
}
