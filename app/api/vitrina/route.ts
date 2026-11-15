import { readSnapshot } from "../../../lib/catalogo";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(readSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
