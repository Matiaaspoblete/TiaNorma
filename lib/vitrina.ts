export const PHOTO_FIELDS = {
  clientKey: "clientKey",
  title: "title",
  price: "price",
  photo: "photo",
} as const;

export type VisiblePiece = {
  id: string;
  title: string;
  priceLabel: string;
  imageUrl: string;
  sold: boolean;
};

export type Vitrina = {
  revision: number;
  pieces: readonly VisiblePiece[];
};

export type PhotoReceipt =
  | { ok: true; title: string; priceLabel: string }
  | { ok: false; reason: string };

function pieceImageUrl(url: string): boolean {
  if (url.includes("..") || url.includes("\\") || url.includes("//")) return false;
  if (url.startsWith("/api/piezas/")) return url.length > "/api/piezas/".length && !url.slice("/api/piezas/".length).includes("/");
  if (url.startsWith("/api/galeria/")) return /^[a-z0-9-]{1,40}$/.test(url.slice("/api/galeria/".length));
  if (url.startsWith("/semillas/")) return /^[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$/.test(url.slice("/semillas/".length));
  return false;
}

export function parseVitrina(input: unknown): Vitrina | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (typeof record.revision !== "number" || !Number.isInteger(record.revision)) return null;
  if (!Array.isArray(record.pieces)) return null;
  const pieces: VisiblePiece[] = [];
  for (const piece of record.pieces) {
    if (!piece || typeof piece !== "object" || Array.isArray(piece)) return null;
    const item = piece as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id) return null;
    if (typeof item.title !== "string" || typeof item.priceLabel !== "string") return null;
    if (typeof item.sold !== "boolean") return null;
    if (typeof item.imageUrl !== "string" || !pieceImageUrl(item.imageUrl)) return null;
    pieces.push({
      id: item.id,
      title: item.title,
      priceLabel: item.priceLabel,
      imageUrl: item.imageUrl,
      sold: item.sold,
    });
  }
  return { revision: record.revision, pieces };
}
