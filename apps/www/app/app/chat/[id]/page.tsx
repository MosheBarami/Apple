import { redirect } from "next/navigation";

// A chat was always one project (its conversation id is the project id); old links land on the project page.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pair?: string }>;
}) {
  const [{ id }, { pair }] = await Promise.all([params, searchParams]);
  redirect(`/app/projects/${encodeURIComponent(id)}${pair === "1" ? "?pair=1" : ""}`);
}
