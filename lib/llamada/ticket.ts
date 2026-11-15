import "server-only";

import { createGateway } from "@ai-sdk/gateway";
import { readSnapshot, voiceToolDefinitions } from "../catalogo";

const MODEL = "elevenlabs/eleven-realtime-v1-mini";
// Agustín. Voz argentina.
const VOICE = "ByVRQtaK1WDOvTmP1PKO";

function instructions(): string {
  const pieces = readSnapshot()
    .pieces.map((piece) => `${piece.title} a ${piece.priceLabel}${piece.sold ? ", vendida" : ""}`)
    .join("; ");
  return [
    "Te llamás Goncy. Sos el sobrino de Norma y ella es tu tía. Te llama para que le administres el catálogo de la página.",
    "A ella nunca la llamés Norma ni por el nombre: siempre decile tía.",
    "Hablás en español rioplatense, de vos, en joda, confianzudo y divertido. Nada de usted y nada de locutor. Una o dos frases cortas.",
    `Piezas publicadas ahora: ${pieces || "ninguna"}. Usá esos nombres exactos. Si dice vendida, ya está marcada y sigue en la página.`,
    "Si pide cambiar un precio, llamá a actualizar_precio en ese mismo turno, con el nombre exacto y el precio en pesos enteros: 18000, no 18. No esperes un segundo sí.",
    "Si dice que vendió una pieza y no aclara si la deja o la saca, no llames ninguna herramienta. Preguntale en una frase: Tía, ¿lo marco como vendido por si hacés otro igual, o lo saco de la página?",
    "Si elige dejarla vendida, o directamente dice que la marques como vendida, llamá a marcar_vendido en ese mismo turno, con el nombre exacto. Queda en la página.",
    "Si elige sacarla, o pide sacarla de la página, llamá a sacar_producto en ese mismo turno, con el nombre exacto.",
    "Si dice que se equivocó, que la vuelva a poner o que hizo otra igual, llamá a poner_activo en ese mismo turno, con el nombre exacto.",
    "No inventes productos ni precios. Si quiere una pieza nueva, no la crees: decile que te mande la foto por WhatsApp con el nombre y el precio.",
    "Cuando una herramienta te responda, decile en una frase qué quedó hecho. Si dice que no pudo, decile eso y no insistas. Decí los precios en palabras.",
    "Si Norma se despide o da por terminada la charla (chau, nos vemos, listo, nada más, cortá, basta, bueno dale), llamá a colgar en ese mismo turno, con motivo despedida. No cortes solo porque ya anotaste un cambio: esperá a que ella cierre. No abras otro tema después.",
  ].join(" ");
}

const GREETING =
  "La llamada acaba de conectar. Saludala como Goncy, decile tía (nunca Norma), en joda y con confianza, y preguntale qué quiere cambiar en el catálogo hoy. Una frase corta.";

const colgar = {
  type: "function" as const,
  name: "colgar",
  description:
    "Corta la llamada cuando Norma se despide o da por terminada la charla (chau, nos vemos, listo, nada más, cortá, basta, bueno dale). No la uses solo porque ya se anotó un cambio. motivo es despedida.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      motivo: { type: "string", description: "Siempre despedida." },
    },
    required: ["motivo"],
  },
};

export type CallTicket = {
  url: string;
  protocols: string[];
  session: unknown;
  greeting: string;
};

function gatewayKey(): string {
  const first = process.env.AI_GATEWAY_API_KEY?.trim();
  if (first) return first;
  const second = process.env.VERCEL_AI_GATEWAY?.trim();
  if (second) return second;
  throw new Error("Falta VERCEL_AI_GATEWAY en .env.local");
}

function sessionConfig() {
  return {
    instructions: instructions(),
    voice: VOICE,
    outputModalities: ["audio"],
    inputAudioFormat: { type: "audio/pcm", rate: 24000 },
    outputAudioFormat: { type: "audio/pcm", rate: 24000 },
    turnDetection: { type: "semantic-vad" },
    inputAudioTranscription: { language: "es" },
    outputAudioTranscription: { language: "es" },
    tools: [...voiceToolDefinitions(), colgar],
  };
}

export async function mintTicket(): Promise<CallTicket> {
  const gateway = createGateway({ apiKey: gatewayKey() });
  const realtime = gateway.experimental_realtime;
  if (!realtime) throw new Error("No se pudo abrir la llamada.");
  const { token, url } = await realtime.getToken({ model: MODEL });
  const model = realtime(MODEL);
  if (!model.getWebSocketConfig) throw new Error("No se pudo abrir la llamada.");
  const config = model.getWebSocketConfig({ token, url });
  return {
    url: config.url,
    protocols: [...(config.protocols ?? [])],
    session: sessionConfig(),
    greeting: GREETING,
  };
}
