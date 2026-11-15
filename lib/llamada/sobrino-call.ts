"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nombreForSoldTool, rememberSpeech, soldName, type PieceMemory } from "./pedido";
import { notifyVitrina } from "../vitrina-aviso";
import { parseVitrina } from "../vitrina";

export type CallPhase = "idle" | "dialing" | "live" | "ended";

export type Caption = {
  id: string;
  who: "norma" | "sobrino";
  text: string;
};

export type SobrinoCall = {
  phase: CallPhase;
  status: string;
  captions: readonly Caption[];
  start: () => void;
  hangup: () => void;
};

type GreetingText = string & { readonly brand: "GreetingText" };

type ResponseGate = { type: "closed" } | { type: "open" };

type MicGate = "blocked" | "sealed" | "holding" | "open";

type ToolFollowUp = "none" | "owed";

type Hangup = "off" | "armed" | "closing";

type Machine =
  | { type: "idle" }
  | { type: "dialing" }
  | {
      type: "live";
      greeting: "pending" | "sent";
      gate: ResponseGate;
      mic: MicGate;
      followUp: ToolFollowUp;
      hangup: Hangup;
    }
  | { type: "ended"; reason: string };

type GreetingCreate = {
  event: {
    type: "response-create";
    options: { modalities: ["audio"]; instructions: GreetingText };
  };
  gate: { type: "open" };
};

type FollowUpCreate = {
  event: { type: "response-create"; options: { modalities: ["audio"] } };
  gate: { type: "open" };
};

type Session = {
  machine: Machine;
  status: string;
  captions: Caption[];
  sobrinoId: string | null;
  heardVoice: boolean;
  playbackStarted: boolean;
};

type Rig = {
  generation: number;
  ws: WebSocket | null;
  ctx: AudioContext | null;
  stream: MediaStream | null;
  source: MediaStreamAudioSourceNode | null;
  node: AudioWorkletNode | null;
  playAt: number;
  speakingUntil: number;
  greeting: GreetingText | null;
  control: Promise<void>;
  captionSeq: number;
  handledCalls: Set<string>;
  titles: string[];
  memory: PieceMemory;
};

const SAMPLE_RATE = 24000;
const HANGUP_TOOL = "colgar";

function createGreeting(_gate: { type: "closed" }, greeting: GreetingText): GreetingCreate {
  return {
    event: {
      type: "response-create",
      options: { modalities: ["audio"], instructions: greeting },
    },
    gate: { type: "open" },
  };
}

function createFollowUp(_gate: { type: "closed" }): FollowUpCreate {
  return {
    event: { type: "response-create", options: { modalities: ["audio"] } },
    gate: { type: "open" },
  };
}

function phaseOf(machine: Machine): CallPhase {
  if (machine.type === "live") return "live";
  if (machine.type === "dialing") return "dialing";
  if (machine.type === "ended") return "ended";
  return "idle";
}

function emptySession(): Session {
  return {
    machine: { type: "idle" },
    status: "Todavía no hay llamada.",
    captions: [],
    sobrinoId: null,
    heardVoice: false,
    playbackStarted: false,
  };
}

function pcm16ToFloat(base64: string) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const floats = new Float32Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < floats.length; i += 1) floats[i] = view.getInt16(i * 2, true) / 32768;
  return floats;
}

function downsample(input: Float32Array, fromRate: number) {
  if (fromRate === SAMPLE_RATE) return input;
  const ratio = fromRate / SAMPLE_RATE;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    output[i] = input[Math.min(input.length - 1, Math.floor(i * ratio))] ?? 0;
  }
  return output;
}

function floatToBase64(float32: Float32Array) {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i] ?? 0));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function argumentsJson(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return "";
}

function toolCallFrom(record: Record<string, unknown>): { callId: string; name: string; argumentsJson: string } | null {
  let name = typeof record.name === "string" ? record.name : "";
  let callId =
    typeof record.callId === "string" ? record.callId : typeof record.call_id === "string" ? record.call_id : "";
  let args: unknown = record.arguments ?? record.args;
  const rawType = typeof record.rawType === "string" ? record.rawType : "";
  const toolEvent =
    record.type === "function-call-arguments-done" ||
    record.type === "response.function_call_arguments.done" ||
    rawType === "client_tool_call";
  if (record.type === "custom" || rawType === "client_tool_call") {
    const raw = record.raw;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const envelope = raw as Record<string, unknown>;
      const tool =
        envelope.client_tool_call && typeof envelope.client_tool_call === "object"
          ? (envelope.client_tool_call as Record<string, unknown>)
          : envelope;
      if (typeof tool.tool_name === "string") name = tool.tool_name;
      if (typeof tool.name === "string" && !name) name = tool.name;
      if (typeof tool.tool_call_id === "string") callId = tool.tool_call_id;
      if (typeof tool.call_id === "string" && !callId) callId = tool.call_id;
      if (tool.parameters !== undefined) args = tool.parameters;
    }
  }
  if (!toolEvent || !name || !callId) return null;
  return { callId, name, argumentsJson: argumentsJson(args) || "{}" };
}

function sendEvent(socket: WebSocket | null, event: unknown) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(event));
}

function brandGreeting(value: unknown): GreetingText | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value as GreetingText;
}

function parseTicket(input: unknown): { url: string; protocols: string[]; session: unknown; greeting: GreetingText } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (typeof record.url !== "string" || !record.url) return null;
  if (!Array.isArray(record.protocols) || record.protocols.some((item) => typeof item !== "string")) return null;
  if (!record.session || typeof record.session !== "object") return null;
  const greeting = brandGreeting(record.greeting);
  if (!greeting) return null;
  return {
    url: record.url,
    protocols: record.protocols as string[],
    session: record.session,
    greeting,
  };
}

function messageFor(error: unknown): string {
  if (error instanceof Error && error.name === "NotAllowedError") return "El navegador no dejó usar el micrófono.";
  if (error instanceof Error && error.message) return error.message;
  return "No se pudo llamar.";
}

export function useSobrinoCall(): SobrinoCall {
  const sessionRef = useRef<Session>(emptySession());
  const rigRef = useRef<Rig>({
    generation: 0,
    ws: null,
    ctx: null,
    stream: null,
    source: null,
    node: null,
    playAt: 0,
    speakingUntil: 0,
    greeting: null,
    control: Promise.resolve(),
    captionSeq: 0,
    handledCalls: new Set<string>(),
    titles: [],
    memory: { lastTitle: null, awaitingChoice: false },
  });
  const mounted = useRef(true);
  const [, setVersion] = useState(0);
  const commit = useCallback(() => {
    if (!mounted.current) return;
    setVersion((value) => value + 1);
  }, []);

  const nephewIsSpeaking = useCallback(() => {
    const ctx = rigRef.current.ctx;
    if (!ctx) return false;
    return ctx.currentTime < rigRef.current.speakingUntil + 0.12;
  }, []);

  const stopRig = useCallback(() => {
    const rig = rigRef.current;
    const socket = rig.ws;
    rig.ws = null;
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendEvent(socket, { type: "session-close" });
      socket.close();
    } else if (socket && socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
    rig.stream?.getTracks().forEach((track) => track.stop());
    rig.stream = null;
    rig.source?.disconnect();
    rig.source = null;
    rig.node?.disconnect();
    rig.node = null;
    const ctx = rig.ctx;
    rig.ctx = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
    rig.playAt = 0;
    rig.speakingUntil = 0;
  }, []);

  const finish = useCallback(
    (reason: string) => {
      const machine = sessionRef.current.machine;
      if (machine.type === "idle" || machine.type === "ended") return;
      rigRef.current.generation += 1;
      stopRig();
      sessionRef.current.machine = { type: "ended", reason };
      sessionRef.current.status = reason;
      sessionRef.current.sobrinoId = null;
      commit();
    },
    [commit, stopRig],
  );

  const sendAudio = useCallback((float32: Float32Array) => {
    const session = sessionRef.current;
    const socket = rigRef.current.ws;
    if (session.machine.type !== "live" || session.machine.mic !== "open") return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    sendEvent(socket, { type: "input-audio-append", audio: floatToBase64(float32) });
  }, []);

  const playPcm = useCallback(
    (base64: string) => {
      const ctx = rigRef.current.ctx;
      if (!ctx || !base64) return;
      sessionRef.current.playbackStarted = true;
      const floats = pcm16ToFloat(base64);
      if (!floats.length) return;
      const buffer = ctx.createBuffer(1, floats.length, SAMPLE_RATE);
      buffer.copyToChannel(floats, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      const start = Math.max(ctx.currentTime + 0.04, rigRef.current.playAt);
      source.start(start);
      rigRef.current.playAt = start + buffer.duration;
      rigRef.current.speakingUntil = rigRef.current.playAt;
      const session = sessionRef.current;
      let changed = session.status !== "Goncy está hablando…";
      session.status = "Goncy está hablando…";
      if (session.machine.type === "live") {
        const live = session.machine;
        if (live.mic === "sealed" && live.followUp === "none") {
          session.machine = { ...live, mic: "holding" };
          changed = true;
        } else if (live.mic === "open" || live.mic === "holding") {
          if (live.mic !== "holding") {
            session.machine = { ...live, mic: "holding" };
            changed = true;
          }
        }
      }
      if (changed) commit();
    },
    [commit],
  );

  const appendSobrino = useCallback((text: string, done: boolean) => {
    if (!text) return;
    const session = sessionRef.current;
    if (!session.sobrinoId) {
      rigRef.current.captionSeq += 1;
      session.sobrinoId = `sobrino-${rigRef.current.captionSeq}`;
      session.captions = [...session.captions, { id: session.sobrinoId, who: "sobrino", text }];
    } else if (done) {
      const id = session.sobrinoId;
      session.captions = session.captions.map((caption) => (caption.id === id ? { ...caption, text } : caption));
    } else {
      const id = session.sobrinoId;
      session.captions = session.captions.map((caption) =>
        caption.id === id ? { ...caption, text: `${caption.text}${text}` } : caption,
      );
    }
    if (done) session.sobrinoId = null;
  }, []);

  const appendNorma = useCallback((text: string) => {
    if (!text) return;
    rigRef.current.captionSeq += 1;
    const id = `norma-${rigRef.current.captionSeq}`;
    sessionRef.current.captions = [...sessionRef.current.captions, { id, who: "norma", text }];
  }, []);

  const listedTitles = useCallback(async () => {
    try {
      const response = await fetch("/api/vitrina", { cache: "no-store" });
      if (!response.ok) return [];
      const parsed = parseVitrina(await response.json());
      return parsed ? parsed.pieces.map((piece) => piece.title) : [];
    } catch {
      return [];
    }
  }, []);

  const postSold = useCallback(async (generation: number, nombre: string) => {
    try {
      await fetch("/api/voz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "marcar_vendido", arguments: JSON.stringify({ nombre }) }),
      });
    } catch {
      return;
    }
    if (rigRef.current.generation !== generation) return;
    notifyVitrina();
  }, []);

  const flushFollowUp = useCallback((generation: number) => {
    const session = sessionRef.current;
    if (rigRef.current.generation !== generation) return;
    if (session.machine.type !== "live") return;
    if (session.machine.gate.type !== "closed" || session.machine.followUp !== "owed") return;
    const socket = rigRef.current.ws;
    // A second response-create while one is open hangs up the call, so her
    // buffered audio is cleared before this create.
    sendEvent(socket, { type: "input-audio-clear" });
    const created = createFollowUp(session.machine.gate);
    sendEvent(socket, created.event);
    session.machine = { ...session.machine, followUp: "none", gate: created.gate };
  }, []);

  const handleControl = useCallback(
    async (generation: number, type: string, record: Record<string, unknown>) => {
      if (rigRef.current.generation !== generation) return;
      if (type === "error") {
        const message = typeof record.message === "string" && record.message ? record.message : "La llamada se cortó.";
        finish(message);
        return;
      }
      const session = sessionRef.current;
      if (session.machine.type !== "live") return;
      if (type === "session-updated") {
        if (session.machine.greeting !== "pending" || session.machine.gate.type !== "closed") return;
        const greeting = rigRef.current.greeting;
        if (!greeting) return;
        // ElevenLabs stays silent on a greeting response-create unless she already has a turn.
        sendEvent(rigRef.current.ws, {
          type: "conversation-item-create",
          item: { type: "text-message", role: "user", text: "Hola, soy Norma." },
        });
        const created = createGreeting(session.machine.gate, greeting);
        sendEvent(rigRef.current.ws, created.event);
        session.machine = { ...session.machine, greeting: "sent", gate: created.gate };
        session.status = "En llamada. Goncy saluda…";
        commit();
        return;
      }
      if (type === "response-created") {
        if (session.machine.gate.type === "open") return;
        session.machine = { ...session.machine, gate: { type: "open" } };
        return;
      }
      const toolCall = toolCallFrom(record);
      if (toolCall) {
        if (rigRef.current.handledCalls.has(toolCall.callId)) return;
        rigRef.current.handledCalls.add(toolCall.callId);
        const { callId, name } = toolCall;
        const argumentsJson =
          name === "marcar_vendido"
            ? nombreForSoldTool(toolCall.argumentsJson, rigRef.current.titles, rigRef.current.memory.lastTitle)
            : toolCall.argumentsJson;
        if (name === "marcar_vendido") {
          try {
            const parsed: unknown = JSON.parse(argumentsJson);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              const nombre = (parsed as { nombre?: unknown }).nombre;
              if (typeof nombre === "string" && rigRef.current.titles.includes(nombre)) {
                rigRef.current.memory = { ...rigRef.current.memory, lastTitle: nombre };
              }
            }
          } catch {
            // The call still goes out with the arguments already chosen.
          }
        }
        if (name === HANGUP_TOOL) {
          const spoke = session.heardVoice || nephewIsSpeaking();
          session.machine = {
            ...session.machine,
            mic: "sealed",
            followUp: spoke ? "none" : "owed",
            hangup: "armed",
          };
          session.status = "Goncy corta…";
          sendEvent(rigRef.current.ws, {
            type: "conversation-item-create",
            item: {
              type: "function-call-output",
              callId,
              name,
              output: spoke
                ? "La llamada se corta. No hables más."
                : "Despedite en una frase corta y no digas nada más.",
            },
          });
          if (session.machine.gate.type === "closed") {
            if (session.machine.followUp === "owed") {
              flushFollowUp(generation);
              const current = sessionRef.current.machine;
              if (current.type === "live") {
                sessionRef.current.machine = { ...current, hangup: "closing", mic: "sealed" };
              }
            } else {
              session.machine = { ...session.machine, hangup: "closing" };
            }
          }
          commit();
          return;
        }
        // Audio frames are not on this chain, so the follow-up is owed before
        // the await or playback would treat the tool response as the follow-up.
        session.machine = { ...session.machine, mic: "sealed", followUp: "owed" };
        session.status = "Anotando el cambio…";
        commit();
        let output = "No pude anotar el cambio. Probá de nuevo.";
        try {
          const response = await fetch("/api/voz", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, arguments: argumentsJson }),
          });
          const json: unknown = await response.json();
          if (json && typeof json === "object" && typeof (json as { output?: unknown }).output === "string") {
            output = (json as { output: string }).output;
          }
        } catch {
          output = "No pude anotar el cambio. Probá de nuevo.";
        }
        notifyVitrina();
        if (rigRef.current.generation !== generation || sessionRef.current.machine.type !== "live") return;
        sendEvent(rigRef.current.ws, {
          type: "conversation-item-create",
          item: { type: "function-call-output", callId, name, output },
        });
        if (sessionRef.current.machine.type === "live" && sessionRef.current.machine.gate.type === "closed") {
          flushFollowUp(generation);
        }
        commit();
        return;
      }
      if (type === "response-done") {
        const spoke = session.heardVoice || nephewIsSpeaking();
        session.sobrinoId = null;
        session.heardVoice = false;
        if (session.machine.type !== "live") return;
        session.machine = { ...session.machine, gate: { type: "closed" } };
        if (session.machine.hangup === "armed") {
          if (session.machine.followUp === "owed" && !spoke) {
            flushFollowUp(generation);
            const current = sessionRef.current.machine;
            if (current.type === "live") {
              sessionRef.current.machine = { ...current, hangup: "closing", mic: "sealed" };
            }
          } else {
            session.machine = { ...session.machine, followUp: "none", hangup: "closing", mic: "sealed" };
          }
          commit();
          return;
        }
        if (session.machine.hangup === "closing") {
          session.machine = { ...session.machine, followUp: "none", mic: "sealed" };
          commit();
          return;
        }
        if (session.machine.followUp === "owed") flushFollowUp(generation);
        else if (session.machine.mic === "sealed") {
          session.machine = { ...session.machine, mic: "open" };
          session.status = "Hablá, Norma.";
        }
        commit();
        return;
      }
      if (type === "audio-transcript-delta" && typeof record.delta === "string") {
        session.heardVoice = true;
        appendSobrino(record.delta, false);
        commit();
        return;
      }
      if (type === "text-delta" && typeof record.delta === "string" && !session.heardVoice) {
        appendSobrino(record.delta, false);
        commit();
        return;
      }
      if (type === "audio-transcript-done") {
        const transcript = typeof record.transcript === "string" ? record.transcript : "";
        const spoken =
          transcript.trim() ||
          session.captions.find((caption) => caption.id === session.sobrinoId)?.text ||
          "";
        appendSobrino(spoken, true);
        if (spoken.trim()) {
          const titles = await listedTitles();
          if (rigRef.current.generation === generation) {
            rigRef.current.titles = titles;
            rigRef.current.memory = rememberSpeech("sobrino", spoken, titles, rigRef.current.memory);
          }
        }
        commit();
        return;
      }
      if (type === "text-done" && typeof record.text === "string" && !session.heardVoice) {
        appendSobrino(record.text, true);
        if (record.text.trim()) {
          const titles = await listedTitles();
          if (rigRef.current.generation === generation) {
            rigRef.current.titles = titles;
            rigRef.current.memory = rememberSpeech("sobrino", record.text, titles, rigRef.current.memory);
          }
        }
        commit();
        return;
      }
      if (type === "input-transcription-completed") {
        const transcript = typeof record.transcript === "string" ? record.transcript : "";
        appendNorma(transcript);
        commit();
        if (transcript.trim()) {
          const titles = await listedTitles();
          if (rigRef.current.generation !== generation || sessionRef.current.machine.type !== "live") return;
          const nombre = soldName(transcript, titles, rigRef.current.memory);
          rigRef.current.titles = titles;
          rigRef.current.memory = rememberSpeech("norma", transcript, titles, rigRef.current.memory);
          if (nombre) await postSold(generation, nombre);
        }
        return;
      }
      if (type === "speech-started") {
        session.status = "Norma está hablando…";
        commit();
        return;
      }
      if (type === "speech-stopped") {
        session.status = "Un segundo…";
        commit();
      }
    },
    [appendNorma, appendSobrino, commit, finish, flushFollowUp, listedTitles, nephewIsSpeaking, postSold],
  );

  const enqueueControl = useCallback(
    (generation: number, type: string, record: Record<string, unknown>) => {
      const rig = rigRef.current;
      const job = () => handleControl(generation, type, record);
      const run = rig.control.then(job, job);
      rig.control = run.then(
        () => undefined,
        () => undefined,
      );
    },
    [handleControl],
  );

  const onSocketMessage = useCallback(
    (generation: number, data: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      const record = parsed as Record<string, unknown>;
      if (typeof record.type !== "string") return;
      if (record.type === "audio-delta" || record.type === "audio-chunk") {
        if (typeof record.delta === "string") playPcm(record.delta);
        return;
      }
      enqueueControl(generation, record.type, record);
    },
    [enqueueControl, playPcm],
  );

  const startMic = useCallback(
    async (ctx: AudioContext, generation: number) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (rigRef.current.generation !== generation) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }
      const source = ctx.createMediaStreamSource(stream);
      try {
      const worklet = URL.createObjectURL(
        new Blob(
          [
            `class MicProcessor extends AudioWorkletProcessor {
              process(inputs) {
                const channel = inputs[0] && inputs[0][0];
                if (channel) this.port.postMessage(channel);
                return true;
              }
            }
            registerProcessor("mic-processor", MicProcessor);`,
          ],
          { type: "text/javascript" },
        ),
      );
      await ctx.audioWorklet.addModule(worklet);
      URL.revokeObjectURL(worklet);
      if (rigRef.current.generation !== generation) {
        stream.getTracks().forEach((track) => track.stop());
        source.disconnect();
        return null;
      }
      const node = new AudioWorkletNode(ctx, "mic-processor");
      let carry = new Float32Array(0);
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const rate = rigRef.current.ctx?.sampleRate ?? ctx.sampleRate;
        const chunk = downsample(event.data, rate);
        const merged = new Float32Array(carry.length + chunk.length);
        merged.set(carry);
        merged.set(chunk, carry.length);
        const frame = Math.round(SAMPLE_RATE * 0.1);
        let offset = 0;
        while (merged.length - offset >= frame) {
          sendAudio(merged.subarray(offset, offset + frame));
          offset += frame;
        }
        carry = merged.slice(offset);
      };
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(node);
      node.connect(mute);
      mute.connect(ctx.destination);
      return { stream, source, node };
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        source.disconnect();
        throw error;
      }
    },
    [sendAudio],
  );

  const connect = useCallback(
    async (generation: number) => {
      let ctx: AudioContext | null = null;
      let localStream: MediaStream | null = null;
      let localSource: MediaStreamAudioSourceNode | null = null;
      let localNode: AudioWorkletNode | null = null;
      let socket: WebSocket | null = null;
      const stopLocal = () => {
        localStream?.getTracks().forEach((track) => track.stop());
        localStream = null;
        localSource?.disconnect();
        localSource = null;
        localNode?.disconnect();
        localNode = null;
        if (ctx && ctx.state !== "closed") void ctx.close();
        ctx = null;
        if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
        socket = null;
      };
      try {
        try {
          ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
        } catch {
          ctx = new AudioContext();
        }
        await ctx.resume();
        if (rigRef.current.generation !== generation) {
          stopLocal();
          return;
        }
        const mic = await startMic(ctx, generation);
        if (!mic || rigRef.current.generation !== generation) {
          stopLocal();
          return;
        }
        localStream = mic.stream;
        localSource = mic.source;
        localNode = mic.node;
        rigRef.current.ctx = ctx;
        rigRef.current.stream = mic.stream;
        rigRef.current.source = mic.source;
        rigRef.current.node = mic.node;
        sessionRef.current.status = "Llamando…";
        commit();
        const response = await fetch("/api/call", { method: "POST" });
        const payload: unknown = await response.json().catch(() => null);
        if (rigRef.current.generation !== generation) {
          stopLocal();
          return;
        }
        if (!response.ok) {
          const reason =
            payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
              ? (payload as { error: string }).error
              : "No se pudo llamar.";
          throw new Error(reason);
        }
        const ticket = parseTicket(payload);
        if (!ticket) throw new Error("No se pudo llamar.");
        rigRef.current.greeting = ticket.greeting;
        socket = new WebSocket(ticket.url, ticket.protocols);
        const liveSocket = socket;
        rigRef.current.ws = liveSocket;
        liveSocket.addEventListener("open", () => {
          if (rigRef.current.generation !== generation || rigRef.current.ws !== liveSocket) return;
          sessionRef.current.machine = {
            type: "live",
            greeting: "pending",
            gate: { type: "closed" },
            mic: "blocked",
            followUp: "none",
            hangup: "off",
          };
          sessionRef.current.status = "Llamando…";
          commit();
          sendEvent(liveSocket, { type: "session-update", config: ticket.session });
        });
        liveSocket.addEventListener("message", (event) => {
          if (typeof event.data === "string") onSocketMessage(generation, event.data);
        });
        liveSocket.addEventListener("close", () => {
          if (rigRef.current.generation !== generation) return;
          finish("Se cortó la llamada.");
        });
        liveSocket.addEventListener("error", () => {
          if (rigRef.current.generation !== generation) return;
          const live = sessionRef.current.machine.type === "live";
          finish(live ? "Se cortó la llamada." : "No se pudo conectar la llamada.");
        });
      } catch (error) {
        if (rigRef.current.generation !== generation) {
          stopLocal();
          return;
        }
        stopLocal();
        if (rigRef.current.ctx === ctx) rigRef.current.ctx = null;
        finish(messageFor(error));
      }
    },
    [commit, finish, onSocketMessage, startMic],
  );

  const begin = useCallback(() => {
    const type = sessionRef.current.machine.type;
    if (type === "dialing" || type === "live") return;
    rigRef.current.generation += 1;
    const generation = rigRef.current.generation;
    sessionRef.current = {
      machine: { type: "dialing" },
      status: "Activando el micrófono…",
      captions: [],
      sobrinoId: null,
      heardVoice: false,
      playbackStarted: false,
    };
    rigRef.current.playAt = 0;
    rigRef.current.speakingUntil = 0;
    rigRef.current.greeting = null;
    rigRef.current.handledCalls = new Set<string>();
    rigRef.current.titles = [];
    rigRef.current.memory = { lastTitle: null, awaitingChoice: false };
    commit();
    void connect(generation);
  }, [commit, connect]);

  const hangup = useCallback(() => {
    const type = sessionRef.current.machine.type;
    if (type === "idle" || type === "ended") return;
    finish("Llamada cortada.");
  }, [finish]);

  const goodbyeFinished = useCallback(() => {
    const ctx = rigRef.current.ctx;
    if (!ctx) return true;
    return ctx.currentTime >= rigRef.current.speakingUntil + 0.4;
  }, []);

  const tick = useCallback(() => {
    const session = sessionRef.current;
    if (session.machine.type !== "live") return;
    const speaking = nephewIsSpeaking();
    if (session.machine.hangup === "closing" && session.machine.gate.type === "closed" && goodbyeFinished()) {
      finish("Goncy cortó.");
      return;
    }
    if (session.machine.hangup !== "off") return;
    if (session.machine.mic === "blocked" && session.playbackStarted && !speaking) {
      session.machine = { ...session.machine, mic: "open" };
      session.status = "Hablá, Norma.";
      commit();
      return;
    }
    if (session.machine.mic === "holding" && !speaking) {
      session.machine = { ...session.machine, mic: "open" };
      session.status = "Hablá, Norma.";
      commit();
    }
  }, [commit, finish, goodbyeFinished, nephewIsSpeaking]);

  const finishRef = useRef(finish);
  const tickRef = useRef(tick);
  finishRef.current = finish;
  tickRef.current = tick;

  useEffect(() => {
    mounted.current = true;
    const id = window.setInterval(() => tickRef.current(), 250);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
      finishRef.current("Llamada cortada.");
    };
  }, []);

  const session = sessionRef.current;
  return {
    phase: phaseOf(session.machine),
    status: session.status,
    captions: session.captions,
    start: begin,
    hangup,
  };
}
