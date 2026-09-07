import { ResultScreen } from "@/app/_components/result-screen";

export default async function ResultPage({ params }: { readonly params: Promise<{ session: string }> }) {
  const { session } = await params;
  return <ResultScreen sessionId={session} />;
}
