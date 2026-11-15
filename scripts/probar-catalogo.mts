import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const dataDir = path.join(root, "data");
fs.rmSync(dataDir, { recursive: true, force: true });

const catalogo = await import("../lib/catalogo.ts");

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

try {
  const seeds = catalogo.readSnapshot();
  check(
    seeds.pieces.map((piece) => piece.title).join("|") ===
      "Cuenco de sal|Jarra lechera|Plato hondo|Taza sin asa|Florero chico",
    `semillas: ${seeds.pieces.map((piece) => piece.title).join(", ")}`,
  );
  check(
    seeds.pieces.map((piece) => piece.priceLabel).join("|") ===
      "$ 18.000|$ 24.000|$ 15.000|$ 12.000|$ 27.000",
    `precios iniciales: ${seeds.pieces.map((piece) => piece.priceLabel).join(", ")}`,
  );
  const seedImage = catalogo.readPieceImage("cuenco-de-sal");
  check(seedImage?.mediaType === "image/jpeg" && seedImage.bytes.byteLength > 0, "la foto del cuenco no se lee");

  const priced = await catalogo.runVoiceTool(
    "actualizar_precio",
    JSON.stringify({ nombre: "Florero chico", precio: 18000 }),
  );
  console.log(`precio: ${priced.output}`);
  check(priced.output === "Dejé Florero chico a dieciocho mil pesos.", priced.output);
  const afterPrice = catalogo.readSnapshot();
  check(afterPrice.revision === seeds.revision + 1, `revision precio ${seeds.revision} -> ${afterPrice.revision}`);
  check(
    afterPrice.pieces.find((piece) => piece.title === "Florero chico")?.priceLabel === "$ 18.000",
    "el florero no quedó en $ 18.000",
  );

  const pricedAgain = await catalogo.runVoiceTool(
    "actualizar_precio",
    JSON.stringify({ nombre: "Florero chico", precio: 18000 }),
  );
  console.log(`precio repetido: ${pricedAgain.output}`);
  const repeatPrice = catalogo.readSnapshot();
  check(pricedAgain.output === "El precio de Florero chico ya es dieciocho mil pesos.", pricedAgain.output);
  check(repeatPrice.revision === afterPrice.revision, `el precio repetido cambió la revision a ${repeatPrice.revision}`);

  const hidden = await catalogo.runVoiceTool("sacar_producto", JSON.stringify({ nombre: "taza" }));
  console.log(`ocultar: ${hidden.output}`);
  check(hidden.output === "Saqué Taza sin asa de la página.", hidden.output);
  const afterHide = catalogo.readSnapshot();
  check(afterHide.revision === repeatPrice.revision + 1, `revision ocultar ${repeatPrice.revision} -> ${afterHide.revision}`);
  check(!afterHide.pieces.some((piece) => piece.title === "Taza sin asa"), "la taza sigue en la página");
  check(catalogo.readPieceImage("taza-sin-asa") === null, "la taza oculta todavía tiene foto");

  const hiddenAgain = await catalogo.runVoiceTool("sacar_producto", JSON.stringify({ nombre: "taza" }));
  console.log(`ocultar repetido: ${hiddenAgain.output}`);
  const repeatHide = catalogo.readSnapshot();
  check(hiddenAgain.output === "Taza sin asa ya no está en la página.", hiddenAgain.output);
  check(repeatHide.revision === afterHide.revision, `el ocultar repetido cambió la revision a ${repeatHide.revision}`);

  const key = "11111111-1111-4111-8111-111111111111";
  const published = await catalogo.publishPiece({
    clientKey: key,
    title: "Bowl de prueba",
    priceText: "9.000",
    bytes: png,
    mediaType: "image/png",
  });
  console.log(`publicar: ${JSON.stringify(published)}`);
  check(published.ok === true && published.title === "Bowl de prueba" && published.priceLabel === "$ 9.000", "no publicó el bowl");
  const afterPublish = catalogo.readSnapshot();
  check(afterPublish.revision === repeatHide.revision + 1, `revision publicar ${repeatHide.revision} -> ${afterPublish.revision}`);
  const bowl = afterPublish.pieces.find((piece) => piece.title === "Bowl de prueba");
  check(bowl?.priceLabel === "$ 9.000" && bowl.imageUrl.startsWith("/api/piezas/") && !bowl.imageUrl.includes(".."), "el bowl no está en la página");
  const bowlImage = catalogo.readPieceImage(bowl.imageUrl.slice("/api/piezas/".length));
  check(bowlImage?.mediaType === "image/png" && bowlImage.bytes.byteLength === png.byteLength, "la foto nueva no se lee");

  const sameKey = await catalogo.publishPiece({
    clientKey: key,
    title: "Otro nombre",
    priceText: "1000",
    bytes: png,
    mediaType: "image/png",
  });
  const afterSameKey = catalogo.readSnapshot();
  check(sameKey.ok === true && sameKey.title === "Bowl de prueba" && sameKey.priceLabel === "$ 9.000", "la misma foto no devolvió la pieza guardada");
  check(afterSameKey.revision === afterPublish.revision, "la misma foto creó otra revision");
  check(!afterSameKey.pieces.some((piece) => piece.title === "Otro nombre"), "la misma foto cambió el nombre");

  const clash = await catalogo.publishPiece({
    clientKey: "22222222-2222-4222-8222-222222222222",
    title: "Taza sin asa",
    priceText: "9000",
    bytes: png,
    mediaType: "image/png",
  });
  const afterClash = catalogo.readSnapshot();
  console.log(`nombre repetido: ${JSON.stringify(clash)}`);
  check(clash.ok === false && clash.reason === "Ya hay una pieza con ese nombre. Elegí otro.", clash.ok ? "" : clash.reason);
  check(afterClash.revision === afterPublish.revision, "el nombre repetido cambió la revision");

  check(
    afterClash.pieces.map((piece) => `${piece.title} ${piece.priceLabel}`).join("|") ===
      "Cuenco de sal $ 18.000|Jarra lechera $ 24.000|Plato hondo $ 15.000|Florero chico $ 18.000|Bowl de prueba $ 9.000",
    afterClash.pieces.map((piece) => `${piece.title} ${piece.priceLabel}`).join(", "),
  );
  check(catalogo.readPieceImage("../secreto") === null, "un id con .. devolvió bytes");
  console.log("catalog proof ok");
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log("data removed");
}
