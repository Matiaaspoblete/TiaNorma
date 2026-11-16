"use client";

import { Flor } from "./flor";
import { useVitrina } from "../lib/use-vitrina";
import type { Vitrina } from "../lib/vitrina";
import styles from "./page.module.css";

export function VitrinaGrid({ initial }: { initial: Vitrina }) {
  const vitrina = useVitrina(initial);
  if (vitrina.pieces.length === 0 && vitrina.ready) {
    return <p className={styles.empty}>Ahora no hay piezas en el taller.</p>;
  }
  return (
    <ul className={styles.grid}>
      {vitrina.pieces.map((piece, index) => (
        <li key={piece.id} className={styles.plate}>
          <div className={piece.sold ? `${styles.frame} ${styles.frameSold}` : styles.frame}>
            <img
              src={piece.imageUrl}
              alt={piece.title}
              width={1400}
              height={933}
              decoding={index === 0 ? "auto" : "async"}
              loading={index < 2 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : index < 2 ? "auto" : "low"}
            />
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
  );
}
