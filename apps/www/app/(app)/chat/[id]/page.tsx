import { ChatView } from "@/components/app/chat-view";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pair?: string }>;
}) {
  const [{ id }, { pair }] = await Promise.all([params, searchParams]);
  return <ChatView pair={pair === "1"} projectId={id} />;
}
