import { mintTicket } from "../../../lib/llamada/ticket";

export const dynamic = "force-dynamic";

function publicMessage(error: unknown): string {
  const fallback = "No se pudo abrir la llamada.";
  const message = error instanceof Error && error.message ? error.message : fallback;
  const secrets = [process.env.AI_GATEWAY_API_KEY, process.env.VERCEL_AI_GATEWAY];
  for (const secret of secrets) {
    if (secret && message.includes(secret)) return fallback;
  }
  return message;
}

export async function POST() {
  try {
    return Response.json(await mintTicket(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: publicMessage(error) }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
