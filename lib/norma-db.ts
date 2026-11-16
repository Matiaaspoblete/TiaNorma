import "server-only";

import postgres from "postgres";

export type NormaPieceRow = {
  id: string;
  title: string;
  price: number;
  listed: boolean;
  sold: boolean;
  clientKey: string | null;
  imageKind: "seed" | "upload";
  imageFile: string;
  revision: number;
};

export type NormaUpload = {
  id: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Uint8Array;
};

type PieceQuery = {
  id: string;
  title: string;
  price: number;
  listed: boolean;
  sold: boolean;
  client_key: string | null;
  image_kind: string;
  image_file: string;
  revision: number;
};

type PhotoQuery = {
  media_type: string | null;
  image_bytes: Buffer | null;
};

function db() {
  const url = process.env.NORMA_DATABASE_URL;
  if (!url) throw new Error("Falta NORMA_DATABASE_URL.");
  const slot = globalThis as typeof globalThis & { __normaSql?: ReturnType<typeof postgres> };
  if (!slot.__normaSql) slot.__normaSql = postgres(url, { prepare: false, ssl: "require", max: 3, idle_timeout: 20 });
  return slot.__normaSql;
}

export function normaDatabaseEnabled(): boolean {
  return Boolean(process.env.NORMA_DATABASE_URL);
}

function pieceRow(row: PieceQuery): NormaPieceRow {
  if (row.image_kind !== "seed" && row.image_kind !== "upload") throw new Error("Pieza ilegible.");
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    listed: row.listed,
    sold: row.sold,
    clientKey: row.client_key,
    imageKind: row.image_kind,
    imageFile: row.image_file,
    revision: row.revision,
  };
}

export async function readNormaPieces(): Promise<NormaPieceRow[]> {
  const rows = await db()<PieceQuery[]>`
    select id, title, price, listed, sold, client_key, image_kind, image_file, revision
    from norma.pieza
  `;
  return rows.map(pieceRow);
}

export async function writeNormaPieces(rows: readonly NormaPieceRow[], upload?: NormaUpload): Promise<void> {
  if (rows.length === 0) throw new Error("El catálogo quedó vacío.");
  const ids = rows.map((row) => row.id);
  await db().begin(async (tx) => {
    await tx`delete from norma.pieza where not (id = any(${ids}))`;
    for (const row of rows) {
      const photo = upload && upload.id === row.id ? upload : null;
      if (photo) {
        await tx`
          insert into norma.pieza (
            id, title, price, listed, sold, client_key, image_kind, image_file, media_type, image_bytes, revision
          ) values (
            ${row.id}, ${row.title}, ${row.price}, ${row.listed}, ${row.sold}, ${row.clientKey},
            ${row.imageKind}, ${row.imageFile}, ${photo.mediaType}, ${Buffer.from(photo.bytes)}, ${row.revision}
          )
          on conflict (id) do update set
            title = excluded.title,
            price = excluded.price,
            listed = excluded.listed,
            sold = excluded.sold,
            client_key = excluded.client_key,
            image_kind = excluded.image_kind,
            image_file = excluded.image_file,
            media_type = excluded.media_type,
            image_bytes = excluded.image_bytes,
            revision = excluded.revision
        `;
        continue;
      }
      const updated = await tx`
        update norma.pieza set
          title = ${row.title},
          price = ${row.price},
          listed = ${row.listed},
          sold = ${row.sold},
          client_key = ${row.clientKey},
          image_kind = ${row.imageKind},
          image_file = ${row.imageFile},
          revision = ${row.revision}
        where id = ${row.id}
      `;
      if (updated.count > 0 || row.imageKind !== "seed") continue;
      await tx`
        insert into norma.pieza (
          id, title, price, listed, sold, client_key, image_kind, image_file, revision
        ) values (
          ${row.id}, ${row.title}, ${row.price}, ${row.listed}, ${row.sold}, ${row.clientKey},
          ${row.imageKind}, ${row.imageFile}, ${row.revision}
        )
      `;
    }
  });
}

const GALLERY_ID = /^[a-z0-9-]{1,40}$/;

export async function readGaleria(
  id: string,
): Promise<{ bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp" } | null> {
  if (!GALLERY_ID.test(id)) return null;
  const rows = await db()<PhotoQuery[]>`
    select media_type, image_bytes
    from norma.galeria
    where id = ${id}
  `;
  const row = rows[0];
  if (!row?.image_bytes || (row.media_type !== "image/jpeg" && row.media_type !== "image/png" && row.media_type !== "image/webp")) {
    return null;
  }
  return { bytes: new Uint8Array(row.image_bytes), mediaType: row.media_type };
}

export async function readNormaUpload(
  id: string,
): Promise<{ bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp" } | null> {
  const rows = await db()<PhotoQuery[]>`
    select media_type, image_bytes
    from norma.pieza
    where id = ${id} and listed = true and image_kind = 'upload'
  `;
  const row = rows[0];
  if (!row?.image_bytes || (row.media_type !== "image/jpeg" && row.media_type !== "image/png" && row.media_type !== "image/webp")) {
    return null;
  }
  return { bytes: new Uint8Array(row.image_bytes), mediaType: row.media_type };
}
