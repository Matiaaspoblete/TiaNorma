import { Suspense } from "react";
import { preload } from "react-dom";
import { readSnapshot } from "../lib/catalogo";
import { phoneHref, phoneLabel } from "../lib/phone";
import { Cuenco, Florero, Plato, Ramo } from "./ceramica";
import { Flor } from "./flor";
import { VitrinaGrid } from "./vitrina-grid";
import styles from "./page.module.css";

function prettyPhone(value: string) {
  const match = value.match(/^\+54(\d)(\d{2})(\d{4})(\d{4})$/);
  if (!match) return value;
  return `+54 ${match[1]} ${match[2]} ${match[3]}-${match[4]}`;
}

export const dynamic = "force-dynamic";

function VitrinaFallback() {
  return (
    <ul className={styles.grid} aria-hidden="true">
      {[0, 1].map((item) => (
        <li key={item} className={styles.plate}>
          <div className={styles.frame} />
        </li>
      ))}
    </ul>
  );
}

async function Catalogo() {
  const vitrina = await readSnapshot();
  for (const piece of vitrina.pieces.slice(0, 2)) {
    preload(piece.imageUrl, { as: "image", fetchPriority: "high" });
  }
  return <VitrinaGrid initial={vitrina} />;
}

export default function Page() {
  return (
    <main className={styles.page}>
      <div className={styles.ground} aria-hidden="true">
        <Plato className={styles.groundPlate} />
        <Florero className={styles.groundVase} />
        <Ramo className={styles.groundSprigA} />
        <Ramo className={styles.groundSprigB} />
        <Flor className={styles.fleckA} />
        <Flor className={styles.fleckB} />
        <Flor className={styles.fleckC} />
      </div>
      <div className={styles.inner}>
        <header className={styles.header}>
          <Cuenco className={styles.mark} />
          <div className={styles.intro}>
            <div className={styles.titleRow}>
              <h1>El taller de Norma</h1>
              <a className={styles.callCard} href={phoneHref()}>
                <Flor className={styles.callSeal} />
                <span>
                  <span className={styles.callLabel}>Para llamadas o mensajes</span>
                  <span className={styles.callNumber}>{prettyPhone(phoneLabel())}</span>
                </span>
              </a>
            </div>
            <p className={styles.lead}>Piezas de cerámica. Para encargar, llamala o mandale un mensaje.</p>
          </div>
        </header>
        <Suspense fallback={<VitrinaFallback />}>
          <Catalogo />
        </Suspense>
      </div>
    </main>
  );
}
