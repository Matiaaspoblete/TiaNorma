import { readFile } from "node:fs/promises";
import path from "node:path";

const clipPath = path.join(process.cwd(), "contenido", "semillas", "abuelasacandofoto.mp4");

let cached: Promise<Buffer> | null = null;

function loadClip() {
  if (!cached) {
    cached = readFile(clipPath).catch((error: unknown) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

function byteRange(size: number, header: string) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Number(rawEnd);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const clip = await loadClip().catch(() => null);
  if (!clip) {
    return new Response("No está el video.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const headers = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
  const range = request.headers.get("range");
  if (!range) {
    return new Response(new Uint8Array(clip), {
      headers: { ...headers, "Content-Length": String(clip.length) },
    });
  }

  const slice = byteRange(clip.length, range);
  if (!slice) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${clip.length}` } });
  }

  const body = clip.subarray(slice.start, slice.end + 1);
  return new Response(new Uint8Array(body), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${slice.start}-${slice.end}/${clip.length}`,
      "Content-Length": String(body.length),
    },
  });
}
