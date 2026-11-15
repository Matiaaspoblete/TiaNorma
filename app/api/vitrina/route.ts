import { readSnapshot } from "../../../lib/catalogo";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await readSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
