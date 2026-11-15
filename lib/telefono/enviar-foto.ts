import { PHOTO_FIELDS, type PhotoReceipt } from "../vitrina";

export type PhotoDraft = {
  clientKey: string;
  title: string;
  priceText: string;
  file: File;
};

function parseReceipt(input: unknown): PhotoReceipt | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (record.ok === true && typeof record.title === "string" && typeof record.priceLabel === "string") {
    return { ok: true, title: record.title, priceLabel: record.priceLabel };
  }
  if (record.ok === false && typeof record.reason === "string" && record.reason) {
    return { ok: false, reason: record.reason };
  }
  return null;
}

async function postOnce(draft: PhotoDraft): Promise<PhotoReceipt | null> {
  const body = new FormData();
  body.set(PHOTO_FIELDS.clientKey, draft.clientKey);
  body.set(PHOTO_FIELDS.title, draft.title);
  body.set(PHOTO_FIELDS.price, draft.priceText);
  body.set(PHOTO_FIELDS.photo, draft.file);
  const response = await fetch("/api/piezas", { method: "POST", body });
  return parseReceipt(await response.json());
}

export async function submitPhoto(draft: PhotoDraft): Promise<PhotoReceipt> {
  try {
    const receipt = await postOnce(draft);
    if (receipt) return receipt;
  } catch {
    // One retry uses the same clientKey.
  }
  try {
    const receipt = await postOnce(draft);
    if (receipt) return receipt;
  } catch {
    // Both tries failed.
  }
  return { ok: false, reason: "No pude subir la foto." };
}
