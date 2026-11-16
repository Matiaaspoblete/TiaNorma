export type PieceMemory = {
  lastTitle: string | null;
  awaitingChoice: boolean;
};

type TitleHit =
  | { type: "one"; title: string }
  | { type: "none" }
  | { type: "many"; titles: readonly string[] };

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titlesInSpeech(spoken: string, titles: readonly string[]): TitleHit {
  const name = normalize(spoken);
  if (!name) return { type: "none" };
  const full = titles.filter((title) => name.includes(normalize(title)));
  if (full.length === 1) {
    const title = full[0];
    if (title) return { type: "one", title };
  }
  if (full.length > 1) return { type: "many", titles: full };
  const words = name.split(" ").filter((word) => word.length >= 4);
  const hits = titles.filter((title) => {
    const titleWords = normalize(title).split(" ").filter((word) => word.length >= 4);
    return titleWords.some((word) => words.includes(word));
  });
  if (hits.length === 1) {
    const title = hits[0];
    if (title) return { type: "one", title };
  }
  if (hits.length > 1) return { type: "many", titles: hits };
  return { type: "none" };
}

function refusesSold(text: string): boolean {
  return /\bno (me )?(la |lo |las |los )?marques\b/.test(text) || /\bno (me )?(la |lo )?pongas como vendid/.test(text);
}

function wantsSold(text: string, awaitingChoice: boolean): boolean {
  if (!text || refusesSold(text)) return false;
  if (/como vendid/.test(text)) return true;
  if (/\bmarc\w*/.test(text) && /\bvendid/.test(text)) return true;
  if (
    /\b(deja(la|lo|rla|rlo)?|dejo|pone(la|lo|rla|rlo)?|ponela|ponelo|ponerla|ponerlo|queda|quede|quedar)\b/.test(text) &&
    /\bvendid/.test(text)
  ) {
    return true;
  }
  if (!awaitingChoice || /\bsac\w*/.test(text)) return false;
  return /^(si |dale |bueno |ok )?(marca(la|lo)?|vendid[oa]|deja(la|lo)( vendid[oa])?)$/.test(text);
}

export function rememberSpeech(
  who: "norma" | "sobrino",
  spoken: string,
  titles: readonly string[],
  state: PieceMemory,
): PieceMemory {
  const hit = titlesInSpeech(spoken, titles);
  const lastTitle = hit.type === "one" ? hit.title : state.lastTitle;
  if (who === "sobrino") {
    const text = normalize(spoken);
    const asking = text.includes("vendid") && /\bsac/.test(text);
    return { lastTitle, awaitingChoice: asking ? true : state.awaitingChoice };
  }
  return { lastTitle, awaitingChoice: false };
}

const SMALL: Record<string, number> = {
  un: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
};

const TENS: Record<string, number> = {
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

const HUNDREDS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
};

type Span = { title: string; index: number; length: number };

function wordsOf(value: string): string[] {
  return value.split(" ").filter(Boolean);
}

function underHundred(words: readonly string[], index: number): { value: number; next: number } | null {
  const word = words[index];
  if (!word) return null;
  if (/^\d{1,3}$/.test(word)) return { value: Number(word), next: index + 1 };
  if (word in SMALL) return { value: SMALL[word] ?? 0, next: index + 1 };
  const ten = TENS[word];
  if (ten === undefined) return null;
  const unit = words[index + 2];
  if (words[index + 1] === "y" && unit && unit in SMALL && (SMALL[unit] ?? 10) < 10) {
    return { value: ten + (SMALL[unit] ?? 0), next: index + 3 };
  }
  return { value: ten, next: index + 1 };
}

function underThousand(words: readonly string[], index: number): { value: number; next: number } | null {
  const hundred = HUNDREDS[words[index] ?? ""];
  if (hundred === undefined) return underHundred(words, index);
  const rest = underHundred(words, index + 1);
  if (!rest) return { value: hundred, next: index + 1 };
  return { value: hundred + rest.value, next: rest.next };
}

function priceAt(words: readonly string[], index: number): { value: number; next: number } | null {
  const word = words[index];
  if (!word) return null;
  if (/^\d{1,3}(?:\.\d{3})+$/.test(word)) {
    const value = Number(word.replace(/\./g, ""));
    if (value < 1000 || value > 9_999_999) return null;
    return { value, next: index + 1 };
  }
  if (/^\d{4,7}$/.test(word)) {
    const value = Number(word);
    if (value < 1000 || value > 9_999_999) return null;
    return { value, next: index + 1 };
  }
  const group = underThousand(words, index);
  if (!group || group.value < 1) return null;
  let value = group.value;
  let next = group.next;
  if (words[next] === "mil" || words[next] === "lucas") {
    value *= 1000;
    next += 1;
    const rest = underThousand(words, next);
    if (rest && rest.value < 1000) {
      value += rest.value;
      next = rest.next;
    }
  } else if (value >= 2 && value < 1000) {
    value *= 1000;
  }
  if (value < 1000 || value > 9_999_999) return null;
  return { value, next };
}

function firstPrice(fragment: string): number | null {
  const words = wordsOf(fragment);
  for (let index = 0; index < words.length; index += 1) {
    const found = priceAt(words, index);
    if (found) return found.value;
  }
  return null;
}

function lastPrice(fragment: string): number | null {
  const words = wordsOf(fragment);
  let price: number | null = null;
  for (let index = 0; index < words.length; index += 1) {
    const found = priceAt(words, index);
    if (found) price = found.value;
  }
  return price;
}

function titleSpans(name: string, titles: readonly string[]): Span[] {
  const taken = new Array<boolean>(name.length).fill(false);
  const spans: Span[] = [];
  const ordered = [...titles].sort((left, right) => normalize(right).length - normalize(left).length);
  for (const title of ordered) {
    const needle = normalize(title);
    if (needle.length < 4) continue;
    let from = 0;
    while (from <= name.length - needle.length) {
      const index = name.indexOf(needle, from);
      if (index < 0) break;
      const end = index + needle.length;
      const leftOk = index === 0 || name[index - 1] === " ";
      const rightOk = end === name.length || name[end] === " ";
      const open = taken.slice(index, end).every((bit) => !bit);
      if (leftOk && rightOk && open) {
        spans.push({ title, index, length: needle.length });
        for (let cursor = index; cursor < end; cursor += 1) taken[cursor] = true;
      }
      from = index + needle.length;
    }
  }
  const claimed = new Set(spans.map((span) => span.title));
  for (const title of titles) {
    if (claimed.has(title)) continue;
    const keys = normalize(title).split(" ").filter((word) => word.length >= 4);
    for (const key of keys) {
      const owners = titles.filter((item) => normalize(item).split(" ").includes(key));
      if (owners.length !== 1) continue;
      let from = 0;
      while (from <= name.length - key.length) {
        const index = name.indexOf(key, from);
        if (index < 0) break;
        const end = index + key.length;
        const leftOk = index === 0 || name[index - 1] === " ";
        const rightOk = end === name.length || name[end] === " ";
        const open = taken.slice(index, end).every((bit) => !bit);
        if (leftOk && rightOk && open) {
          spans.push({ title, index, length: key.length });
          for (let cursor = index; cursor < end; cursor += 1) taken[cursor] = true;
          claimed.add(title);
          break;
        }
        from = index + key.length;
      }
      if (claimed.has(title)) break;
    }
  }
  return spans.sort((left, right) => left.index - right.index);
}

export function priceOrders(
  spoken: string,
  titles: readonly string[],
  lastTitle: string | null = null,
): { title: string; price: number }[] {
  const name = normalize(spoken);
  if (!name) return [];
  const spans = titleSpans(name, titles);
  if (spans.length === 0) {
    const price = firstPrice(name);
    if (!price || !lastTitle || !titles.includes(lastTitle)) return [];
    return [{ title: lastTitle, price }];
  }
  const orders: { title: string; price: number }[] = [];
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index];
    if (!span) continue;
    const previous = spans[index - 1];
    const next = spans[index + 1];
    const after = name.slice(span.index + span.length, next ? next.index : name.length);
    const before = name.slice(previous ? previous.index + previous.length : 0, span.index);
    const price = firstPrice(after) ?? lastPrice(before);
    if (price) orders.push({ title: span.title, price });
  }
  return orders;
}

export function soldName(spoken: string, titles: readonly string[], state: PieceMemory): string | null {
  const text = normalize(spoken);
  if (!wantsSold(text, state.awaitingChoice)) return null;
  const hit = titlesInSpeech(spoken, titles);
  if (hit.type === "one") return hit.title;
  if (hit.type === "many") {
    if (state.lastTitle && hit.titles.includes(state.lastTitle)) return state.lastTitle;
    return null;
  }
  return state.lastTitle;
}

export function nombreForSoldTool(argumentsJson: string, titles: readonly string[], lastTitle: string | null): string {
  let spoken = "";
  try {
    const parsed: unknown = JSON.parse(argumentsJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const nombre = (parsed as { nombre?: unknown }).nombre;
      if (typeof nombre === "string") spoken = nombre.trim();
    }
  } catch {
    spoken = "";
  }
  if (!spoken) return lastTitle ? JSON.stringify({ nombre: lastTitle }) : argumentsJson || "{}";
  const hit = titlesInSpeech(spoken, titles);
  if (hit.type === "one") return JSON.stringify({ nombre: hit.title });
  if (hit.type === "many" && lastTitle && hit.titles.includes(lastTitle)) {
    return JSON.stringify({ nombre: lastTitle });
  }
  return argumentsJson;
}
