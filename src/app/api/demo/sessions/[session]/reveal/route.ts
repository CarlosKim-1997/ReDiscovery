import { completeDemoReveal } from "@/application/play/demo-game";
import { getDemoReveal } from "@/application/reveal/get-demo-reveal";
import { services } from "@/server/container";
import { CONWAY_REVEAL } from "@/server/fixtures/conway-reveal";
import { apiError, noStore } from "../../../_shared";

export async function GET(_request: Request, { params }: { params: Promise<{ session: string }> }) {
  try {
    const { session: id } = await params;
    const reveal = await getDemoReveal(services.store, CONWAY_REVEAL, id);
    return reveal ? noStore({ reveal }) : noStore({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ session: string }> }) {
  try {
    const { session: id } = await params;
    const session = await completeDemoReveal(services, id);
    return session ? noStore({ session }) : noStore({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
