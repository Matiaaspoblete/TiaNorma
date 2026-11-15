"use client";

import { useVitrina } from "../lib/use-vitrina";
import { phoneHref, phoneLabel } from "../lib/phone";
import { Cuenco, Flor, Florero, Plato, Ramo } from "./ceramica";
import styles from "./page.module.css";

function prettyPhone(value: string) {
  const match = value.match(/^\+54(\d)(\d{2})(\d{4})(\d{4})$/);
  if (!match) return value;
  return `+54 ${match[1]} ${match[2]} ${match[3]}-${match[4]}`;
}

export default function Page() {
  const vitrina = useVitrina();
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
        {vitrina.pieces.length === 0 && vitrina.ready ? (
          <p className={styles.empty}>Ahora no hay piezas en el taller.</p>
        ) : (
          <ul className={styles.grid}>
            {vitrina.pieces.map((piece) => (
              <li key={piece.id} className={styles.plate}>
                <div className={piece.sold ? `${styles.frame} ${styles.frameSold}` : styles.frame}>
                  <img src={piece.imageUrl} alt={piece.title} />
                </div>
                <div className={styles.meta}>
                  <h2>{piece.title}</h2>
                  {piece.sold ? (
                    <p className={styles.sold}>Vendido</p>
                  ) : (
                    <p className={styles.price}>
                      <Flor className={styles.seal} />
                      {piece.priceLabel}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
