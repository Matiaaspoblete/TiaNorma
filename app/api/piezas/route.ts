import { publishPiece } from "../../../lib/catalogo";
import { PHOTO_FIELDS, type PhotoReceipt } from "../../../lib/vitrina";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    const receipt: PhotoReceipt = { ok: false, reason: "No pude subir la foto." };
    return Response.json(receipt);
  }
  const clientKey = form.get(PHOTO_FIELDS.clientKey);
  const title = form.get(PHOTO_FIELDS.title);
  const price = form.get(PHOTO_FIELDS.price);
  const photo = form.get(PHOTO_FIELDS.photo);
  if (typeof clientKey !== "string" || typeof title !== "string" || typeof price !== "string" || !(photo instanceof File)) {
    const receipt: PhotoReceipt = { ok: false, reason: "Faltan los datos de la foto." };
    return Response.json(receipt);
  }
  const receipt = await publishPiece({
    clientKey,
    title,
    priceText: price,
    bytes: new Uint8Array(await photo.arrayBuffer()),
    mediaType: photo.type,
  });
  return Response.json(receipt, { headers: { "Cache-Control": "no-store" } });
}
