import { notFound } from "next/navigation";
import { DevPreview } from "@/components/app/dev-preview";

// Design review: ?view=empty | chat | pair, &studio=off. Not available in a production build.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; studio?: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const { view = "empty", studio } = await searchParams;
  return <DevPreview studio={studio === "off" ? "off" : "on"} view={view} />;
}
