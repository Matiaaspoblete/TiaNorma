import "server-only";

const MAX_EDGE = 1400;
const QUALITY = 74;

export async function toDisplayWebp(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.byteLength < 1) throw new Error("Foto vacía.");
  const { default: sharp } = await import("sharp");
  const image = sharp(Buffer.from(bytes), {
    failOn: "none",
    animated: false,
    limitInputPixels: 40_000_000,
  }).rotate();
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error("Foto ilegible.");
  const encoded = await image
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 4, smartSubsample: true })
    .toBuffer();
  if (meta.format === "webp" && encoded.byteLength >= bytes.byteLength && meta.width <= MAX_EDGE && meta.height <= MAX_EDGE) {
    return bytes;
  }
  return new Uint8Array(encoded);
}
