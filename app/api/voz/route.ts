import { runVoiceTool } from "../../../lib/catalogo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let name = "";
  let argumentsJson = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const record = body as Record<string, unknown>;
      if (typeof record.name === "string") name = record.name;
      if (typeof record.arguments === "string") argumentsJson = record.arguments;
    }
  } catch {
    argumentsJson = "";
  }
  const result = await runVoiceTool(name, argumentsJson);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
