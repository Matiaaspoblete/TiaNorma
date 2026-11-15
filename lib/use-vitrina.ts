"use client";

import { useEffect, useRef, useState } from "react";
import { listenVitrina } from "./vitrina-aviso";
import { parseVitrina, type VisiblePiece } from "./vitrina";

function stamp(pieces: readonly VisiblePiece[]): string {
  return pieces.map((piece) => `${piece.id}\n${piece.sold ? "1" : "0"}\n${piece.priceLabel}`).join("\n");
}

export function useVitrina(): { pieces: readonly VisiblePiece[]; ready: boolean } {
  const [pieces, setPieces] = useState<readonly VisiblePiece[]>([]);
  const [ready, setReady] = useState(false);
  const seen = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function pull() {
      try {
        const response = await fetch("/api/vitrina", { cache: "no-store" });
        if (!response.ok) return;
        const parsed = parseVitrina(await response.json());
        if (!parsed || cancelled) return;
        const next = stamp(parsed.pieces);
        if (seen.current === next) return;
        seen.current = next;
        setPieces(parsed.pieces);
        setReady(true);
      } catch {
        // A failed poll keeps the last good grid.
      }
    }

    function onWake() {
      if (document.visibilityState === "hidden") return;
      void pull();
    }

    void pull();
    const id = window.setInterval(() => void pull(), 1000);
    const stopListen = listenVitrina(() => void pull());
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      stopListen();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, []);

  return { pieces, ready };
}
