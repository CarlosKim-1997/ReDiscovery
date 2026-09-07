import { PlayScreen } from "@/app/_components/play-screen";

export default async function PlayPage({ params }: { readonly params: Promise<{ session: string }> }) {
  const { session } = await params;
  return <PlayScreen sessionId={session} />;
}
