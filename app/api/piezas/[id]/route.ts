import { readPieceImage } from "../../../../lib/catalogo";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const image = readPieceImage(id);
  if (!image) {
    return new Response("No encontrada", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new Response(Buffer.from(image.bytes), {
    headers: {
      "Content-Type": image.mediaType,
      "Cache-Control": "no-store",
    },
  });
}
