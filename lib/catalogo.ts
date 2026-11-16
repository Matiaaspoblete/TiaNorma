import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { Experimental_RealtimeModelV4ToolDefinition as RealtimeModelV4ToolDefinition } from "@ai-sdk/provider";
import {
  normaDatabaseEnabled,
  readNormaPieces,
  readNormaUpload,
  writeNormaPieces,
  type NormaPieceRow,
  type NormaUpload,
} from "./norma-db";
import { toDisplayWebp } from "./imagen";
import type { PhotoReceipt, Vitrina } from "./vitrina";

type Pesos = number & { readonly brand: "Pesos" };
type PieceId = string & { readonly brand: "PieceId" };

type Piece = {
  id: PieceId;
  title: string;
  price: Pesos;
  listed: boolean;
  sold: boolean;
  clientKey: string | null;
  image: { kind: "seed"; file: string } | { kind: "upload"; file: string };
};

type Store = {
  revision: number;
  pieces: readonly Piece[];
};

type TitleMatch =
  | { type: "one"; piece: Piece }
  | { type: "none" }
  | { type: "many"; titles: readonly string[] };

type CatalogCommand =
  | { type: "set-price"; spokenName: string; price: Pesos }
  | { type: "hide"; spokenName: string }
  | { type: "mark-sold"; spokenName: string }
  | { type: "reactivate"; spokenName: string }
  | { type: "publish"; piece: Piece };

type Applied = {
  store: Store;
  speech: string;
  changed: boolean;
  outcome: "done" | "rejected";
};

type Owner = {
  store: Store;
  tail: Promise<unknown>;
};

type VoiceToolName = "actualizar_precio" | "sacar_producto" | "marcar_vendido" | "poner_activo";

type VoiceTool = {
  definition: RealtimeModelV4ToolDefinition;
  run: (this: VoiceTool, store: Store, args: unknown) => Applied;
};

const SEEDS = [
  { id: "plato-azul", title: "Plato azul", price: 25000, file: "plato-azul.webp" },
  { id: "taza-y-plato", title: "Taza y plato", price: 12000, file: "taza-y-plato.webp" },
  { id: "caramelera", title: "Caramelera", price: 30000, file: "caramelera.webp" },
  { id: "jarrones", title: "Jarrones", price: 25000, file: "jarrones.webp" },
  { id: "mate-y-cuenco", title: "Mate y cuenco", price: 25000, file: "mate-y-cuenco.webp" },
] as const;

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNREADABLE = "El catálogo guardado no se puede leer.";

const actualizarPrecio = {
  type: "function",
  name: "actualizar_precio",
  description: "Cambia el precio de una pieza que ya está en la página. El precio va en pesos enteros.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      nombre: { type: "string", description: "Nombre de la pieza, como figura en el catálogo." },
      precio: { type: "integer", minimum: 1, maximum: 9999999 },
    },
    required: ["nombre", "precio"],
  },
} satisfies RealtimeModelV4ToolDefinition;

const nombrePieza = {
  nombre: { type: "string", description: "Nombre de la pieza, como figura en el catálogo." },
} as const;

const sacarProducto = {
  type: "function",
  name: "sacar_producto",
  description: "Saca de la página una pieza cuando ella elige que no quede publicada.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: nombrePieza,
    required: ["nombre"],
  },
} satisfies RealtimeModelV4ToolDefinition;

const marcarVendido = {
  type: "function",
  name: "marcar_vendido",
  description: "Marca una pieza como vendida y la deja en la página, por si hace otra igual.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: nombrePieza,
    required: ["nombre"],
  },
} satisfies RealtimeModelV4ToolDefinition;

const ponerActivo = {
  type: "function",
  name: "poner_activo",
  description: "Vuelve a dejar una pieza disponible cuando se equivocó, pide reactivarla o hizo otra igual.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: nombrePieza,
    required: ["nombre"],
  },
} satisfies RealtimeModelV4ToolDefinition;

const VOICE_TOOLS: Record<VoiceToolName, VoiceTool> = {
  actualizar_precio: {
    definition: actualizarPrecio,
    run(store, args) {
      const parsed = readToolArgs(this.definition, args);
      const nombre = parsed?.nombre;
      const precio = parsed?.precio;
      if (typeof nombre !== "string" || typeof precio !== "number") {
        return rejected(store, "No entendí la pieza o el precio.");
      }
      const amount = precio < 1000 ? precio * 1000 : precio;
      const price = pesos(amount);
      if (!price) return rejected(store, "No entendí la pieza o el precio.");
      return applyCommand(store, { type: "set-price", spokenName: nombre, price });
    },
  },
  sacar_producto: {
    definition: sacarProducto,
    run(store, args) {
      const nombre = spokenName(this.definition, args);
      if (!nombre) return rejected(store, "No entendí el nombre de la pieza.");
      return applyCommand(store, { type: "hide", spokenName: nombre });
    },
  },
  marcar_vendido: {
    definition: marcarVendido,
    run(store, args) {
      const nombre = spokenName(this.definition, args);
      if (!nombre) return rejected(store, "No entendí el nombre de la pieza.");
      return applyCommand(store, { type: "mark-sold", spokenName: nombre });
    },
  },
  poner_activo: {
    definition: ponerActivo,
    run(store, args) {
      const nombre = spokenName(this.definition, args);
      if (!nombre) return rejected(store, "No entendí el nombre de la pieza.");
      return applyCommand(store, { type: "reactivate", spokenName: nombre });
    },
  },
};

const TOOL_NAMES = Object.keys(VOICE_TOOLS) as VoiceToolName[];

function pesos(value: number): Pesos | null {
  if (!Number.isInteger(value) || value < 1 || value > 9_999_999) return null;
  return value as Pesos;
}

function brandPesos(value: number): Pesos {
  const price = pesos(value);
  if (!price) throw new Error("Precio de semilla inválido.");
  return price;
}

function brandId(value: string): PieceId {
  if (!safeName(value)) throw new Error("Identificador de pieza inválido.");
  return value as PieceId;
}

function safeName(file: string): string | null {
  if (!file || file.includes("/") || file.includes("\\") || file.includes("..")) return null;
  return file;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPrice(price: Pesos): string {
  const grouped = String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${grouped}`;
}

function underHundred(value: number, beforeNoun: boolean): string {
  const units = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
  if (value < 10) {
    if (value === 1) return beforeNoun ? "un" : "uno";
    return units[value] ?? "cero";
  }
  if (value < 20) {
    const teens = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
    return teens[value - 10] ?? "diez";
  }
  if (value < 30) {
    if (value === 20) return "veinte";
    if (value === 21) return beforeNoun ? "veintiún" : "veintiuno";
    const twenties = ["", "", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
    return twenties[value - 20] ?? "veinte";
  }
  const tens = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const ten = tens[Math.floor(value / 10)] ?? "";
  const unit = value % 10;
  if (unit === 0) return ten;
  if (unit === 1) return `${ten} y ${beforeNoun ? "un" : "uno"}`;
  return `${ten} y ${units[unit]}`;
}

function underThousand(value: number, beforeNoun: boolean): string {
  if (value < 100) return underHundred(value, beforeNoun);
  if (value === 100) return "cien";
  const hundreds = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
  const hundred = Math.floor(value / 100);
  const name = hundreds[hundred] ?? "";
  const rest = value % 100;
  if (rest === 0) return hundred === 1 ? "cien" : name;
  return `${name} ${underHundred(rest, beforeNoun)}`;
}

function priceWords(price: Pesos): string {
  const value = Number(price);
  if (value === 1) return "un peso";
  const millions = Math.floor(value / 1_000_000);
  const thousands = Math.floor((value % 1_000_000) / 1_000);
  const rest = value % 1_000;
  const parts: string[] = [];
  if (millions === 1) parts.push("un millón");
  else if (millions > 1) parts.push(`${underThousand(millions, true)} millones`);
  if (thousands === 1) parts.push("mil");
  else if (thousands > 1) parts.push(`${underThousand(thousands, true)} mil`);
  if (rest > 0) parts.push(underThousand(rest, true));
  const body = parts.join(" ");
  if (millions > 0 && thousands === 0 && rest === 0) return `${body} de pesos`;
  return `${body} pesos`;
}

function matchTitle(pieces: readonly Piece[], spoken: string, scope: "listed" | "all"): TitleMatch {
  const pool = scope === "listed" ? pieces.filter((piece) => piece.listed) : pieces;
  const name = normalize(spoken);
  if (!name) return { type: "none" };
  const exact = pool.filter((piece) => normalize(piece.title) === name);
  if (exact.length === 1) {
    const piece = exact[0];
    if (piece) return { type: "one", piece };
  }
  if (exact.length > 1) return { type: "many", titles: exact.map((piece) => piece.title) };
  if (name.length < 4) return { type: "none" };
  const hits = pool.filter((piece) => {
    const title = normalize(piece.title);
    return title.includes(name) || name.includes(title);
  });
  if (hits.length === 1) {
    const piece = hits[0];
    if (piece) return { type: "one", piece };
  }
  if (hits.length > 1) return { type: "many", titles: hits.map((piece) => piece.title) };
  return { type: "none" };
}

function same(store: Store, speech: string): Applied {
  return { store, speech, changed: false, outcome: "done" };
}

function rejected(store: Store, speech: string): Applied {
  return { store, speech, changed: false, outcome: "rejected" };
}

function manySpeech(titles: readonly string[]): string {
  return `Hay más de una pieza: ${titles.join(", ")}.`;
}

function applyPrice(store: Store, spokenName: string, price: Pesos): Applied {
  const match = matchTitle(store.pieces, spokenName, "listed");
  if (match.type === "none") return rejected(store, "No tengo ninguna pieza con ese nombre.");
  if (match.type === "many") return rejected(store, manySpeech(match.titles));
  if (match.piece.price === price) {
    return same(store, `El precio de ${match.piece.title} ya es ${priceWords(match.piece.price)}.`);
  }
  return {
    store: {
      revision: store.revision + 1,
      pieces: store.pieces.map((piece) => (piece.id === match.piece.id ? { ...piece, price } : piece)),
    },
    speech: `Dejé ${match.piece.title} a ${priceWords(price)}.`,
    changed: true,
    outcome: "done",
  };
}

function applyHide(store: Store, name: string): Applied {
  const match = matchTitle(store.pieces, name, "all");
  if (match.type === "none") return rejected(store, "No tengo ninguna pieza con ese nombre.");
  if (match.type === "many") return rejected(store, manySpeech(match.titles));
  if (!match.piece.listed) return same(store, `${match.piece.title} ya no está en la página.`);
  return {
    store: {
      revision: store.revision + 1,
      pieces: store.pieces.map((piece) =>
        piece.id === match.piece.id ? { ...piece, listed: false, sold: false } : piece,
      ),
    },
    speech: `Saqué ${match.piece.title} de la página.`,
    changed: true,
    outcome: "done",
  };
}

function applySold(store: Store, name: string): Applied {
  const match = matchTitle(store.pieces, name, "all");
  if (match.type === "none") return rejected(store, "No tengo ninguna pieza con ese nombre.");
  if (match.type === "many") return rejected(store, manySpeech(match.titles));
  if (match.piece.listed && match.piece.sold) {
    return same(store, `${match.piece.title} ya está marcada como vendida.`);
  }
  return {
    store: {
      revision: store.revision + 1,
      pieces: store.pieces.map((piece) =>
        piece.id === match.piece.id ? { ...piece, listed: true, sold: true } : piece,
      ),
    },
    speech: `Marqué ${match.piece.title} como vendida. Sigue en la página.`,
    changed: true,
    outcome: "done",
  };
}

function applyReactivate(store: Store, name: string): Applied {
  const match = matchTitle(store.pieces, name, "all");
  if (match.type === "none") return rejected(store, "No tengo ninguna pieza con ese nombre.");
  if (match.type === "many") return rejected(store, manySpeech(match.titles));
  if (match.piece.listed && !match.piece.sold) {
    return same(store, `${match.piece.title} ya está activa.`);
  }
  return {
    store: {
      revision: store.revision + 1,
      pieces: store.pieces.map((piece) =>
        piece.id === match.piece.id ? { ...piece, listed: true, sold: false } : piece,
      ),
    },
    speech: `Volví a dejar ${match.piece.title} activa.`,
    changed: true,
    outcome: "done",
  };
}

function applyPublish(store: Store, piece: Piece): Applied {
  if (piece.clientKey) {
    const existing = store.pieces.find((item) => item.clientKey === piece.clientKey);
    if (existing) return same(store, `${existing.title} ya está en la página a ${priceWords(existing.price)}.`);
  }
  const title = normalize(piece.title);
  if (store.pieces.some((item) => normalize(item.title) === title)) {
    return rejected(store, "Ya hay una pieza con ese nombre. Elegí otro.");
  }
  return {
    store: {
      revision: store.revision + 1,
      pieces: [...store.pieces, { ...piece, listed: true, sold: false }],
    },
    speech: `Listo. ${piece.title} quedó a ${priceWords(piece.price)}.`,
    changed: true,
    outcome: "done",
  };
}

function applyCommand(store: Store, command: CatalogCommand): Applied {
  switch (command.type) {
    case "set-price":
      return applyPrice(store, command.spokenName, command.price);
    case "hide":
      return applyHide(store, command.spokenName);
    case "mark-sold":
      return applySold(store, command.spokenName);
    case "reactivate":
      return applyReactivate(store, command.spokenName);
    case "publish":
      return applyPublish(store, command.piece);
    default: {
      const never: never = command;
      return never;
    }
  }
}

function readSchemaValue(
  schema: { type?: unknown; minimum?: unknown; maximum?: unknown },
  value: unknown,
): unknown | undefined {
  if (schema.type === "string") {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed;
  }
  if (schema.type === "integer") {
    let numeric: number | undefined;
    if (typeof value === "number" && Number.isFinite(value)) numeric = Math.round(value);
    else if (typeof value === "string") {
      const parsed = parsePriceText(value);
      if (parsed) numeric = parsed;
    }
    if (numeric === undefined) return undefined;
    if (typeof schema.minimum === "number" && numeric < schema.minimum) return undefined;
    if (typeof schema.maximum === "number" && numeric > schema.maximum) return undefined;
    return numeric;
  }
  return undefined;
}

function readToolArgs(
  definition: RealtimeModelV4ToolDefinition,
  args: unknown,
): Record<string, unknown> | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  const record = args as Record<string, unknown>;
  const schema = definition.parameters;
  if (schema.type !== "object" || !schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
    return null;
  }
  const properties = schema.properties;
  const allowed = Object.keys(properties);
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key: unknown): key is string => typeof key === "string")
    : [];
  const parsed: Record<string, unknown> = {};
  for (const key of allowed) {
    const property = properties[key];
    if (!property || typeof property === "boolean") return null;
    if (!(key in record)) {
      if (required.includes(key)) return null;
      continue;
    }
    const value = readSchemaValue(property, record[key]);
    if (value === undefined) return null;
    parsed[key] = value;
  }
  return parsed;
}

function spokenName(definition: RealtimeModelV4ToolDefinition, args: unknown): string | null {
  const parsed = readToolArgs(definition, args);
  const nombre = parsed?.nombre;
  if (typeof nombre !== "string") return null;
  return nombre;
}

function catalogFile(): string {
  return path.join(process.cwd(), "data", "catalogo.json");
}

function assertSeedFiles() {
  const dir = path.join(process.cwd(), "public", "semillas");
  // On Vercel the function bundle does not contain public/. The CDN serves those files.
  if (!fs.existsSync(dir)) return;
  for (const seed of SEEDS) {
    if (!fs.existsSync(path.join(dir, seed.file))) throw new Error(`Falta la semilla ${seed.file}.`);
  }
}

function seedStore(): Store {
  return {
    revision: 0,
    pieces: SEEDS.map((seed) => ({
      id: brandId(seed.id),
      title: seed.title,
      price: brandPesos(seed.price),
      listed: true,
      sold: false,
      clientKey: null,
      image: { kind: "seed" as const, file: seed.file },
    })),
  };
}

function serialize(store: Store) {
  return {
    revision: store.revision,
    pieces: store.pieces.map((piece) => ({
      id: piece.id,
      title: piece.title,
      price: piece.price,
      listed: piece.listed,
      sold: piece.sold === true,
      clientKey: piece.clientKey,
      image: piece.image,
    })),
  };
}

function writeStore(store: Store) {
  const file = catalogFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), "catalogo.json.tmp");
  fs.writeFileSync(tmp, `${JSON.stringify(serialize(store), null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function failUnreadable(): never {
  throw new Error(UNREADABLE);
}

function parseStoredPiece(input: unknown): Piece {
  if (!input || typeof input !== "object" || Array.isArray(input)) failUnreadable();
  const record = input as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.title !== "string" || !record.title.trim()) failUnreadable();
  if (typeof record.price !== "number") failUnreadable();
  if (typeof record.listed !== "boolean") failUnreadable();
  const sold = record.sold === undefined ? false : record.sold;
  if (typeof sold !== "boolean") failUnreadable();
  if (record.clientKey !== null && typeof record.clientKey !== "string") failUnreadable();
  const image = record.image;
  if (!image || typeof image !== "object" || Array.isArray(image)) failUnreadable();
  const imageRecord = image as Record<string, unknown>;
  if ((imageRecord.kind !== "seed" && imageRecord.kind !== "upload") || typeof imageRecord.file !== "string") {
    failUnreadable();
  }
  if (!safeName(imageRecord.file) || !safeName(record.id)) failUnreadable();
  const price = pesos(record.price);
  if (!price) failUnreadable();
  return {
    id: record.id as PieceId,
    title: record.title,
    price,
    listed: record.listed,
    sold,
    clientKey: record.clientKey,
    image:
      imageRecord.kind === "seed"
        ? { kind: "seed", file: imageRecord.file }
        : { kind: "upload", file: imageRecord.file },
  };
}

function parseStore(input: unknown): Store {
  if (!input || typeof input !== "object" || Array.isArray(input)) failUnreadable();
  const record = input as Record<string, unknown>;
  if (typeof record.revision !== "number" || !Number.isInteger(record.revision) || record.revision < 0) failUnreadable();
  if (!Array.isArray(record.pieces)) failUnreadable();
  const pieces = record.pieces.map(parseStoredPiece);
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const piece of pieces) {
    if (ids.has(piece.id)) failUnreadable();
    ids.add(piece.id);
    if (piece.clientKey) {
      if (keys.has(piece.clientKey)) failUnreadable();
      keys.add(piece.clientKey);
    }
  }
  return { revision: record.revision, pieces };
}

function loadStore(): Store {
  const file = catalogFile();
  if (!fs.existsSync(file)) {
    const store = seedStore();
    try {
      writeStore(store);
    } catch {
      // Vercel cannot write data/catalogo.json. The five seed pieces still render.
    }
    return store;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    failUnreadable();
  }
  try {
    return parseStore(JSON.parse(raw));
  } catch (error) {
    if (error instanceof Error && error.message === UNREADABLE) throw error;
    failUnreadable();
  }
}

function rowsFromStore(store: Store): NormaPieceRow[] {
  return store.pieces.map((piece) => ({
    id: piece.id,
    title: piece.title,
    price: piece.price,
    listed: piece.listed,
    sold: piece.sold,
    clientKey: piece.clientKey,
    imageKind: piece.image.kind,
    imageFile: piece.image.file,
    revision: store.revision,
  }));
}

function pieceFromRow(row: NormaPieceRow): Piece {
  const price = pesos(row.price);
  if (!price || !safeName(row.id) || !safeName(row.imageFile) || !row.title.trim()) failUnreadable();
  return {
    id: brandId(row.id),
    title: row.title,
    price,
    listed: row.listed,
    sold: row.sold,
    clientKey: row.clientKey,
    image: row.imageKind === "seed" ? { kind: "seed", file: row.imageFile } : { kind: "upload", file: row.imageFile },
  };
}

async function storeFromRows(rows: readonly NormaPieceRow[]): Promise<Store> {
  if (rows.length === 0) {
    const store = seedStore();
    await writeNormaPieces(rowsFromStore(store));
    return store;
  }
  return {
    revision: rows.reduce((max, row) => Math.max(max, row.revision), 0),
    pieces: rows.map(pieceFromRow),
  };
}

async function refresh(owner: Owner) {
  if (!normaDatabaseEnabled()) return;
  owner.store = await storeFromRows(await readNormaPieces());
}

function boot(): Promise<Owner> {
  const slot = globalThis as typeof globalThis & { __tallerDeNorma?: Owner; __tallerBoot?: Promise<Owner> };
  if (slot.__tallerDeNorma) return Promise.resolve(slot.__tallerDeNorma);
  if (!slot.__tallerBoot) {
    slot.__tallerBoot = (async () => {
      assertSeedFiles();
      const store = normaDatabaseEnabled() ? await storeFromRows(await readNormaPieces()) : loadStore();
      const owner: Owner = { store, tail: Promise.resolve() };
      slot.__tallerDeNorma = owner;
      return owner;
    })().catch((error: unknown) => {
      slot.__tallerBoot = undefined;
      throw error;
    });
  }
  return slot.__tallerBoot;
}

function enqueue<T>(job: (owner: Owner) => Promise<T>): Promise<T> {
  return boot().then((owner) => {
    const run = owner.tail.then(() => job(owner), () => job(owner));
    owner.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  });
}

function project(store: Store): Vitrina {
  return {
    revision: store.revision,
    pieces: store.pieces
      .filter((piece) => piece.listed)
      .map((piece) => ({
        id: piece.id,
        title: piece.title,
        priceLabel: formatPrice(piece.price),
        imageUrl: imageUrlFor(piece),
        sold: piece.sold === true,
      })),
  };
}

function seedAsset(file: string): string {
  return file.replace(/\.(?:jpe?g|png)$/i, ".webp");
}

function imageUrlFor(piece: Piece): string {
  if (piece.image.kind === "seed") return `/semillas/${seedAsset(piece.image.file)}`;
  const base = piece.image.file.replace(/\.(?:jpe?g|png|webp)$/i, "");
  if (/^[a-z0-9-]+$/.test(base) && !/^[0-9a-f]{8}-/.test(base)) return `/api/galeria/${base}`;
  return `/api/piezas/${piece.id}`;
}

const displayedWebp = new Map<string, Uint8Array>();

async function displayBytes(
  id: string,
  bytes: Uint8Array,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
): Promise<{ bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp" }> {
  if (mediaType === "image/webp") return { bytes, mediaType };
  const cached = displayedWebp.get(id);
  if (cached) return { bytes: cached, mediaType: "image/webp" };
  try {
    const webp = await toDisplayWebp(bytes);
    if (displayedWebp.has(id)) displayedWebp.delete(id);
    displayedWebp.set(id, webp);
    while (displayedWebp.size > 32) {
      const oldest = displayedWebp.keys().next().value;
      if (oldest === undefined) break;
      displayedWebp.delete(oldest);
    }
    return { bytes: webp, mediaType: "image/webp" };
  } catch {
    return { bytes, mediaType };
  }
}

function mediaTypeFor(file: string): "image/jpeg" | "image/png" | "image/webp" | null {
  const lower = file.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

function extensionFor(mediaType: string): "jpg" | "png" | "webp" | null {
  if (mediaType === "image/jpeg" || mediaType === "image/jpg") return "jpg";
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  return null;
}

function parsePriceText(raw: string): Pesos | null {
  if (raw.includes(",")) return null;
  const compact = raw.replace(/ /g, "");
  if (!compact) return null;
  let digits = compact;
  if (compact.includes(".")) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(compact)) return null;
    digits = compact.replace(/\./g, "");
  } else if (!/^\d+$/.test(compact)) {
    return null;
  }
  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return null;
  return pesos(value);
}

function collapseTitle(raw: string): { ok: true; title: string } | { ok: false; reason: string } {
  const title = raw.trim().replace(/\s+/g, " ");
  if (!title) return { ok: false, reason: "El nombre está vacío." };
  if (title.length > 60) return { ok: false, reason: "El nombre es demasiado largo." };
  return { ok: true, title };
}

function writeImage(fileName: string, bytes: Uint8Array) {
  const file = safeName(fileName);
  if (!file) throw new Error("Nombre de archivo inválido.");
  const dir = path.join(process.cwd(), "data", "piezas");
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `${file}.tmp`);
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, path.join(dir, file));
}

function lookupTool(name: string): VoiceTool | null {
  const found = TOOL_NAMES.find((toolName) => toolName === name);
  if (!found) return null;
  return VOICE_TOOLS[found];
}

async function persist(owner: Owner, applied: Applied, upload?: NormaUpload) {
  if (!applied.changed && !upload) return;
  const store = applied.changed ? applied.store : owner.store;
  if (normaDatabaseEnabled()) await writeNormaPieces(rowsFromStore(store), upload);
  else if (applied.changed) writeStore(store);
  if (applied.changed) owner.store = store;
  invalidateSnapshot();
}

const SNAPSHOT_TTL_MS = 1000;

type SnapshotSlot = { epoch: number; cached: { at: number; value: Vitrina } | null };

function snapshots(): SnapshotSlot {
  const slot = globalThis as typeof globalThis & { __tallerSnapshot?: SnapshotSlot };
  if (!slot.__tallerSnapshot) slot.__tallerSnapshot = { epoch: 0, cached: null };
  return slot.__tallerSnapshot;
}

function freshSnapshot(): Vitrina | null {
  const cached = snapshots().cached;
  if (!cached) return null;
  if (Date.now() - cached.at >= SNAPSHOT_TTL_MS) return null;
  return cached.value;
}

function invalidateSnapshot() {
  const slot = snapshots();
  slot.epoch += 1;
  slot.cached = null;
}

export function readSnapshot(): Promise<Vitrina> {
  const ready = freshSnapshot();
  if (ready) return Promise.resolve(ready);
  return enqueue(async (owner) => {
    const again = freshSnapshot();
    if (again) return again;
    const epoch = snapshots().epoch;
    await refresh(owner);
    const value = project(owner.store);
    if (snapshots().epoch === epoch) snapshots().cached = { at: Date.now(), value };
    return value;
  });
}

export function readPieceImage(
  id: string,
): Promise<{ bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp" } | null> {
  return enqueue(async (owner) => {
    if (!safeName(id)) return null;
    await refresh(owner);
    const piece = owner.store.pieces.find((item) => item.id === id && item.listed);
    if (!piece) return null;
    if (piece.image.kind === "upload" && normaDatabaseEnabled()) {
      const stored = await readNormaUpload(id);
      if (!stored) return null;
      return displayBytes(id, stored.bytes, stored.mediaType);
    }
    const storedName = safeName(piece.image.file);
    if (!storedName) return null;
    const file = piece.image.kind === "seed" ? seedAsset(storedName) : storedName;
    const mediaType = mediaTypeFor(file);
    if (!mediaType) return null;
    const full =
      piece.image.kind === "seed"
        ? path.join(process.cwd(), "public", "semillas", file)
        : path.join(process.cwd(), "data", "piezas", file);
    try {
      return displayBytes(id, new Uint8Array(fs.readFileSync(full)), mediaType);
    } catch {
      return null;
    }
  });
}

export function publishPiece(input: {
  clientKey: string;
  title: string;
  priceText: string;
  bytes: Uint8Array;
  mediaType: string;
}): Promise<PhotoReceipt> {
  return enqueue(async (owner) => {
    if (!UUID_PATTERN.test(input.clientKey)) return { ok: false, reason: "No pude identificar la foto." };
    const title = collapseTitle(input.title);
    if (!title.ok) return { ok: false, reason: title.reason };
    const price = parsePriceText(input.priceText);
    if (!price) return { ok: false, reason: "El precio tiene que ser un número entero." };
    const extension = extensionFor(input.mediaType);
    if (!extension) return { ok: false, reason: "La foto tiene que ser jpg, png o webp." };
    if (input.bytes.byteLength < 1) return { ok: false, reason: "La foto está vacía." };
    if (input.bytes.byteLength > MAX_PHOTO_BYTES) return { ok: false, reason: "La foto es demasiado pesada." };
    let bytes: Uint8Array;
    try {
      bytes = await toDisplayWebp(input.bytes);
    } catch {
      return { ok: false, reason: "La foto tiene que ser jpg, png o webp." };
    }
    const piece: Piece = {
      id: brandId(input.clientKey),
      title: title.title,
      price,
      listed: true,
      sold: false,
      clientKey: input.clientKey,
      image: { kind: "upload", file: `${input.clientKey}.webp` },
    };
    await refresh(owner);
    const known = owner.store.pieces.some((item) => item.clientKey === piece.clientKey);
    const upload: NormaUpload | undefined = !known && normaDatabaseEnabled()
      ? { id: piece.id, mediaType: "image/webp", bytes }
      : undefined;
    if (!known && !upload) {
      try {
        writeImage(piece.image.file, bytes);
      } catch {
        return { ok: false, reason: "No pude guardar la pieza." };
      }
    }
    const applied = applyCommand(owner.store, { type: "publish", piece });
    if (applied.outcome === "rejected") return { ok: false, reason: applied.speech };
    if (applied.changed || upload) {
      try {
        await persist(owner, applied, upload);
      } catch {
        return { ok: false, reason: "No pude guardar la pieza." };
      }
    }
    const saved = applied.store.pieces.find((item) => item.clientKey === piece.clientKey);
    if (!saved) return { ok: false, reason: "No pude guardar la pieza." };
    return { ok: true, title: saved.title, priceLabel: formatPrice(saved.price) };
  });
}

export function runVoiceTool(name: string, argumentsJson: string): Promise<{ output: string }> {
  const tool = lookupTool(name);
  if (!tool) return Promise.resolve({ output: "No conozco ese pedido." });
  let args: unknown;
  try {
    args = JSON.parse(argumentsJson);
  } catch {
    return Promise.resolve({ output: "No pude leer el pedido." });
  }
  return enqueue(async (owner) => {
    await refresh(owner);
    const applied = tool.run(owner.store, args);
    if (applied.changed) {
      try {
        await persist(owner, applied);
      } catch {
        return { output: "No pude anotar el cambio. Probá de nuevo." };
      }
    }
    return { output: applied.speech };
  });
}

export async function voiceToolDefinitions(): Promise<readonly RealtimeModelV4ToolDefinition[]> {
  const names =
    (await readSnapshot())
      .pieces.map((piece) => (piece.sold ? `${piece.title} (vendida)` : piece.title))
      .join(", ") || "ninguna";
  return TOOL_NAMES.map((name) => {
    const definition = VOICE_TOOLS[name].definition;
    const described = (description: string) => ({ ...definition, description: `${description} Piezas: ${names}.` });
    switch (name) {
      case "actualizar_precio":
        return described(
          "Cambia el precio de una pieza que ya está publicada. precio es el monto entero en pesos, por ejemplo 18000, nunca 18 ni 18 mil.",
        );
      case "marcar_vendido":
        return described(
          "Marca la pieza como vendida y la deja en la página, por si hace otra igual. Llamala en el mismo turno en que ella pide marcarla, dejarla o ponerla vendida. Si no repite el nombre, usá la pieza de la que venían hablando. Usá el nombre tal cual. No la saques.",
        );
      case "poner_activo":
        return described(
          "La vuelve a dejar disponible cuando se equivocó, pide reactivarla o hizo otra igual. Usá el nombre tal cual.",
        );
      case "sacar_producto":
        return described("Saca la pieza de la página cuando ella elige que no quede publicada. Usá el nombre tal cual.");
      default: {
        const never: never = name;
        return never;
      }
    }
  });
}
