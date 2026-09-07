import { RevealScreen } from "@/app/_components/reveal-screen";

export default async function RevealPage({ params }: { readonly params: Promise<{ session: string }> }) {
  const { session } = await params;
  return <RevealScreen sessionId={session} />;
}
