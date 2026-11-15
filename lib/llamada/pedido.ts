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
