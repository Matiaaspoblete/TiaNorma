"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSobrinoCall } from "../../lib/llamada/sobrino-call";
import { submitPhoto } from "../../lib/telefono/enviar-foto";
import styles from "./page.module.css";

type Screen = "home" | "phone" | "chat" | "camera" | "gallery" | "messages" | "clock";
type PhoneTab = "keypad" | "recents" | "contacts";

type ChatMessage = {
  id: string;
  who: "norma" | "sobrino";
  text: string;
  imageUrl?: string;
  time: string;
};

type Draft = { clientKey: string; file: File; preview: string };

type ClientSms = { id: string; text: string; time: string };

type ClientThread = {
  id: string;
  name: string;
  barrio: string;
  initial: string;
  color: string;
  when: string;
  preview: string;
  messages: ClientSms[];
};

const CLIENTES: ClientThread[] = [
  {
    id: "mirta",
    name: "Mirta Ledesma",
    barrio: "Caballito",
    initial: "M",
    color: "#8a4b2f",
    when: "09:18",
    preview: "¿La caramelera sigue disponible?",
    messages: [
      {
        id: "mirta-1",
        time: "09:12",
        text: "Hola Normita, soy Mirta Ledesma, de Caballito. ¿La caramelera sigue disponible? Es para el cumpleaños de mi hija.",
      },
      {
        id: "mirta-2",
        time: "09:18",
        text: "Decime si entra bastante, que en casa guardamos los caramelos ahí.",
      },
    ],
  },
  {
    id: "hector",
    name: "Héctor Palacios",
    barrio: "Flores",
    initial: "H",
    color: "#3d5a40",
    when: "08:41",
    preview: "El plato azul de 25.000, ¿es el de la página?",
    messages: [
      {
        id: "hector-1",
        time: "08:36",
        text: "Buen día, Norma. Habla Héctor Palacios, de Flores. El plato azul de 25.000, ¿es el que vi en la página?",
      },
      {
        id: "hector-2",
        time: "08:41",
        text: "Mi mujer lo quiere para la mesa del comedor. ¿Se lava a mano? Al lavavajillas no lo mando.",
      },
    ],
  },
  {
    id: "nelida",
    name: "Nélida Quiroga",
    barrio: "Villa Urquiza",
    initial: "N",
    color: "#6b3a55",
    when: "Ayer",
    preview: "Los jarrones, ¿entra un ramito de jazmines?",
    messages: [
      {
        id: "nelida-1",
        time: "18:04",
        text: "Norma querida, soy Nélida, de Villa Urquiza. Los jarrones me quedaron grabados. ¿Entra un ramito de jazmines o quedan chicos?",
      },
      {
        id: "nelida-2",
        time: "18:09",
        text: "Si me lo guardás hasta el viernes, pasa mi hijo a buscarlo. Él anda por el taller.",
      },
    ],
  },
  {
    id: "betty",
    name: "Beatriz Gómez",
    barrio: "Belgrano",
    initial: "B",
    color: "#1a5276",
    when: "Ayer",
    preview: "La taza y el plato, ¿es cómoda para tomar?",
    messages: [
      {
        id: "betty-1",
        time: "11:22",
        text: "Hola, soy Betty Gómez, de Belgrano. La taza con el platito, ¿es cómoda para tomar? Con la artrosis no agarro bien.",
      },
      {
        id: "betty-2",
        time: "11:27",
        text: "¿La tenés en el azul de siempre? Que combine con los platos del desayuno.",
      },
    ],
  },
  {
    id: "osvaldo",
    name: "Osvaldo Pereyra",
    barrio: "San Telmo",
    initial: "O",
    color: "#5c4a32",
    when: "Lun",
    preview: "El mate y el cuenco, ¿van juntos?",
    messages: [
      {
        id: "osvaldo-1",
        time: "16:48",
        text: "Norma, Osvaldo Pereyra, de San Telmo. El mate y el cuenco, ¿van juntos o los vendés sueltos? Los domingos meriendan los nietos.",
      },
      {
        id: "osvaldo-2",
        time: "16:53",
        text: "Si me los guardás juntos, te aviso y te los pago cuando pase por el taller.",
      },
    ],
  },
];

const PASTILLAS = [
  { id: "presion", time: "07:30", label: "La de la presión", days: "Todos los días" },
  { id: "tiroides", time: "08:15", label: "Tiroides, en ayunas", days: "Antes del café" },
  { id: "azucar", time: "13:00", label: "La del azúcar", days: "Con el almuerzo" },
  { id: "artrosis", time: "16:40", label: "La de la artrosis", days: "Con el mate" },
  { id: "dormir", time: "21:30", label: "La chiquita para dormir", days: "Todas las noches" },
] as const;

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

const FOTOS = [
  { id: "taza-verde", title: "Taza verde", src: "/api/galeria/taza-verde" },
  { id: "tazones", title: "Tazones", src: "/api/galeria/tazones" },
  { id: "mate-negro", title: "Mate negro", src: "/api/galeria/mate-negro" },
] as const;

function usePhoneScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const beside = 336 + 48;
      const next = Math.min(1, (window.innerWidth - 36) / (392 + beside * 2), (window.innerHeight - 36) / 832);
      setScale(next > 0.2 ? next : 0.2);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

const BUENOS_AIRES = "America/Argentina/Buenos_Aires";

function clockText(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: BUENOS_AIRES,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dateText(date: Date) {
  const raw = new Intl.DateTimeFormat("es-AR", {
    timeZone: BUENOS_AIRES,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function elapsedText(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readOrder(text: string): { title: string; price: string } | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.*?)(?:\$\s*)?(\d{1,3}(?:\.\d{3})+|\d{1,7})\s*$/);
  if (!match) return null;
  const title = match[1].replace(/[\s$]+$/g, "").trim().replace(/\s+/g, " ");
  const price = match[2].replace(/\./g, "");
  const value = Number(price);
  if (!title || title.length > 60 || !Number.isInteger(value) || value < 1 || value > 9999999) return null;
  return { title, price };
}

function Signal() {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
      <rect x="0" y="9" width="3" height="5" fill="currentColor" />
      <rect x="4.5" y="6" width="3" height="8" fill="currentColor" />
      <rect x="9" y="3" width="3" height="11" fill="currentColor" />
      <rect x="13.5" y="0" width="2.5" height="14" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

function Wifi() {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
      <path fill="currentColor" d="M8 11.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM8 7.2c1.7 0 3.2.7 4.3 1.8l-1.2 1.2A4.2 4.2 0 0 0 8 9a4.2 4.2 0 0 0-3.1 1.2L3.7 9A6 6 0 0 1 8 7.2zM8 3.2c2.8 0 5.3 1.1 7.2 3l-1.2 1.2A8.2 8.2 0 0 0 8 5.2a8.2 8.2 0 0 0-6 2.2L.8 6.2a10 10 0 0 1 7.2-3z" />
    </svg>
  );
}

function Battery() {
  return (
    <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true">
      <rect x="0.6" y="0.6" width="20" height="10.8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.2" y="2.2" width="14" height="7.6" rx="1" fill="currentColor" />
      <rect x="21.4" y="3.6" width="2" height="4.8" rx="0.6" fill="currentColor" />
    </svg>
  );
}

function Handset({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M6.6 3.8c.4-.4 1-.5 1.5-.3l2.2.9c.5.2.8.7.8 1.2l-.3 2.4c0 .4-.3.8-.7 1L8.8 10c.8 1.6 2.1 2.9 3.7 3.7l1-1.3c.2-.4.6-.6 1-.7l2.4-.3c.5 0 1 .3 1.2.8l.9 2.2c.2.5.1 1.1-.3 1.5l-1.4 1.4c-.4.4-1 .6-1.6.5C11.2 17.4 6.6 12.8 5.2 7.3c-.1-.6.1-1.2.5-1.6L6.6 3.8z" />
    </svg>
  );
}

function BubbleMark() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#fff" d="M5 4h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H10l-4 3v-3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" />
      <path fill="#25D366" d="M8.2 9.2c.2-.2.6-.3.9-.2l1 .4c.3.1.4.4.4.7l-.2 1.1c0 .2-.2.4-.4.5l-.6.5c.4.8 1 1.4 1.8 1.8l.5-.6c.1-.2.3-.3.5-.3l1.1-.2c.3 0 .6.2.7.4l.4 1c.1.3 0 .7-.2.9l-.6.6c-.2.2-.5.3-.8.2-2.2-.5-4.2-2.5-4.7-4.7-.1-.3 0-.6.2-.8l.6-.6z" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M15.4 4.6 8 12l7.4 7.4-1.4 1.4L5.2 12 14 3.2z" />
    </svg>
  );
}

function Nota() {
  return (
    <aside className={styles.note}>
      <p className={styles.writing}>
        Tía, leé esto.
        <br />
        <br />
        1. Cambiar un precio
        <br />
        o sacar una pieza:
        <br />
        Teléfono, llamame.
        <br />
        Yo lo cambio.
        <br />
        <br />
        2. Pieza nueva.
        <br />
        WhatsApp, foto con
        <br />
        el clip, y así:
        <br />
        Plato azul 25000
        <br />
        <br />
        3. Mensajes: gente
        <br />
        que quiere encargar.
        <br />
        <br />
        4. Acordate: las fotos
        <br />
        con la cámara
        <br />
        delantera.
        <br />
        <br />
        <s>El cuadradito no.</s>
        <br />
        El redondel de abajo
        <br />
        te vuelve al principio.
        <br />
        Beso, Goncy
      </p>
    </aside>
  );
}

function StatusBar({ tone, time }: { tone: "light" | "dark" | "photo" | "camera"; time: string }) {
  const toneClass =
    tone === "light" ? styles.statusLight : tone === "photo" ? styles.statusOnPhoto : tone === "camera" ? styles.statusCamera : styles.statusDark;
  return (
    <div className={`${styles.status} ${toneClass}`}>
      <span>{time}</span>
      <span className={styles.statusIcons}>
        <Signal />
        <Wifi />
        <Battery />
      </span>
    </div>
  );
}

function NavBar({
  backEnabled,
  onBack,
  onHome,
  onRecents,
  dark,
}: {
  backEnabled: boolean;
  onBack: () => void;
  onHome: () => void;
  onRecents: () => void;
  dark?: boolean;
}) {
  return (
    <nav className={dark ? `${styles.nav} ${styles.navDark}` : styles.nav} aria-label="Botones del celular">
      <button type="button" aria-label="Recientes" onClick={onRecents}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <rect x="2" y="2" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>
      <button type="button" aria-label="Inicio" onClick={onHome}>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>
      <button type="button" aria-label="Atrás" onClick={onBack} disabled={!backEnabled}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="currentColor" d="M11.2 3.2 5 9.4l6.2 6.2 1.3-1.3L7.6 9.4l4.9-4.9z" />
        </svg>
      </button>
    </nav>
  );
}

export default function TelefonoPage() {
  const call = useSobrinoCall();
  const scale = usePhoneScale();
  const [screen, setScreen] = useState<Screen>("home");
  const [tab, setTab] = useState<PhoneTab>("contacts");
  const [now, setNow] = useState<Date | null>(null);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [digits, setDigits] = useState("");
  const [dialMiss, setDialMiss] = useState("");
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [padOpen, setPadOpen] = useState(false);
  const [callStarted, setCallStarted] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "hola",
      who: "sobrino",
      text: "Hola tía. Si tenés una pieza nueva, mandame la foto con el clip y escribí el nombre y el precio. Algo así, Plato azul 25000.",
      time: "",
    },
  ]);
  const [openClient, setOpenClient] = useState<string | null>(null);
  const [alarmsOn, setAlarmsOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PASTILLAS.map((alarm) => [alarm.id, true])),
  );
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const viewfinderRef = useRef<HTMLVideoElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const [rollStart, setRollStart] = useState<number | null>(null);
  const [rollSeconds, setRollSeconds] = useState(0);
  const [flash, setFlash] = useState(false);
  const [hearClip, setHearClip] = useState(false);
  const inCall = call.phase === "dialing" || call.phase === "live";

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (call.phase === "live") setCallStarted((current) => current ?? Date.now());
    if (call.phase === "idle" || call.phase === "ended") setCallStarted(null);
  }, [call.phase]);

  useEffect(() => {
    if (!callStarted) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [callStarted]);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, screen]);

  useEffect(() => {
    if (screen !== "camera" || rollStart === null) return;
    const id = window.setInterval(() => {
      setRollSeconds(Math.max(0, Math.floor((Date.now() - rollStart) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [screen, rollStart]);

  function push(who: ChatMessage["who"], body: string, imageUrl?: string) {
    const time = now ? clockText(now) : "";
    setMessages((current) => [...current, { id: crypto.randomUUID(), who, text: body, imageUrl, time }]);
  }

  function chooseFile(file: File) {
    setDraft((current) => {
      if (current) URL.revokeObjectURL(current.preview);
      return { clientKey: crypto.randomUUID(), file, preview: URL.createObjectURL(file) };
    });
  }

  function removeDraft() {
    setDraft((current) => {
      if (current) URL.revokeObjectURL(current.preview);
      return null;
    });
  }

  async function pickPhoto(photo: (typeof FOTOS)[number]) {
    if (pickingId) return;
    setPickingId(photo.id);
    try {
      const response = await fetch(photo.src);
      if (!response.ok) return;
      const blob = await response.blob();
      const type = blob.type === "image/png" || blob.type === "image/jpeg" || blob.type === "image/webp" ? blob.type : "image/webp";
      const extension = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp";
      chooseFile(new File([blob], `${photo.id}.${extension}`, { type }));
      setPickerOpen(false);
    } finally {
      setPickingId(null);
    }
  }

  function goHome() {
    setRecentsOpen(false);
    setOpenClient(null);
    setPickerOpen(false);
    setScreen("home");
  }

  function openPhone() {
    setRecentsOpen(false);
    setScreen("phone");
    if (!inCall) setTab("contacts");
  }

  function openCamera() {
    setRecentsOpen(false);
    setFlash(false);
    setRollSeconds(0);
    flushSync(() => {
      setHearClip(true);
      setRollStart(Date.now());
      setScreen("camera");
    });
    const video = viewfinderRef.current;
    if (!video) return;
    video.currentTime = 0;
    video.muted = false;
    void video.play().catch(() => {
      video.muted = true;
      setHearClip(false);
      void video.play().catch(() => {});
    });
  }

  function tapShutter() {
    setFlash(true);
    window.setTimeout(() => setFlash(false), 140);
  }

  function dialGoncy() {
    setDialMiss("");
    setMuted(false);
    setSpeaker(false);
    setScreen("phone");
    call.start();
  }

  function dialFromKeys() {
    if (digits) {
      setDialMiss("Ese número no está agendado.");
      return;
    }
    dialGoncy();
  }

  async function sendChat() {
    if (sending) return;
    const order = readOrder(text);
    if (!draft || !order) {
      if (!draft) push("sobrino", "Tía, falta la foto. Adjuntala con el clip y dejala en el mensaje.");
      else push("sobrino", "Poné el nombre y el precio juntos, tipo Plato azul 25000.");
      return;
    }
    setSending(true);
    const current = draft;
    const caption = text.trim();
    push("norma", caption, current.preview);
    setText("");
    setDraft(null);
    const receipt = await submitPhoto({
      clientKey: current.clientKey,
      title: order.title,
      priceText: order.price,
      file: current.file,
    });
    push("sobrino", receipt.ok ? `Listo, tía. ${receipt.title} quedó a ${receipt.priceLabel}.` : receipt.reason);
    setSending(false);
  }

  const client = CLIENTES.find((item) => item.id === openClient) ?? null;
  const time = now ? clockText(now) : "";
  const lightStatus = screen !== "home" && !(screen === "phone" && inCall);
  const seconds = callStarted ? Math.floor((Date.now() - callStarted) / 1000) : 0;
  void tick;

  return (
    <main className={styles.stage}>
      <div className={styles.desk} style={{ ["--scale" as string]: String(scale) }}>
        <div className={styles.deskInner}>
        <div className={styles.slot}>
        <div className={styles.bezel}>
          <div className={styles.screen}>
            <div className={styles.hole} />
            <StatusBar tone={screen === "camera" ? "camera" : screen === "home" ? "photo" : lightStatus ? "light" : "dark"} time={time} />
            {inCall && !(screen === "phone") ? (
              <button type="button" className={styles.chip} onClick={openPhone}>
                Llamada con Goncy
              </button>
            ) : null}
            <div className={styles.body}>
              {screen === "home" ? (
                <section className={styles.home}>
                  <p className={styles.clock}>{time || " "}</p>
                  <p className={styles.date}>{now ? dateText(now) : ""}</p>
                  <div className={styles.apps}>
                    <button type="button" className={styles.appButton} onClick={openPhone}>
                      <span className={styles.glyph} style={{ background: "#1e8e3e", color: "#fff" }}>
                        <Handset />
                      </span>
                      Teléfono
                    </button>
                    <button type="button" className={styles.appButton} onClick={() => setScreen("messages")}>
                      <span className={styles.glyph} style={{ background: "#1a73e8", color: "#fff" }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
                          <path fill="currentColor" d="M4 5h16v12H7l-3 3z" />
                        </svg>
                      </span>
                      Mensajes
                    </button>
                    <button type="button" className={styles.appButton} onClick={() => setScreen("chat")}>
                      <span className={styles.glyph} style={{ background: "#25D366" }}>
                        <BubbleMark />
                      </span>
                      WhatsApp
                    </button>
                    <button type="button" className={styles.appButton} onClick={openCamera}>
                      <span className={styles.glyph} style={{ background: "#eceff1", color: "#37474f" }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
                          <path fill="currentColor" d="M9 4h6l1.2 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.8L9 4zm3 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
                        </svg>
                      </span>
                      Cámara
                    </button>
                    <button type="button" className={styles.appButton} onClick={() => setScreen("gallery")}>
                      <span className={styles.glyph} style={{ background: "linear-gradient(135deg,#f6bf26,#e8710a 45%,#1a73e8)" }} />
                      Galería
                    </button>
                    <button type="button" className={styles.appButton} onClick={() => setScreen("clock")}>
                      <span className={styles.glyph} style={{ background: "#fff", color: "#1a73e8" }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
                          <path stroke="currentColor" strokeWidth="2" d="M12 8v5l3 2" />
                        </svg>
                      </span>
                      Reloj
                    </button>
                  </div>
                </section>
              ) : null}

              {screen === "phone" && inCall ? (
                <section className={styles.inCall}>
                  <div className={styles.inCallTop}>
                    <button type="button" className={styles.iconHit} style={{ color: "#fff" }} aria-label="Volver al inicio" onClick={goHome}>
                      <BackIcon />
                    </button>
                  </div>
                  <div className={styles.inCallMain}>
                    <div className={styles.avatar}><img src="/telefono/goncy.webp" alt="" width={96} height={96} decoding="async" /></div>
                    <h2>Goncy</h2>
                    <p className={styles.timer}>{call.phase === "live" && callStarted ? elapsedText(seconds) : "Llamando…"}</p>
                    <p className={styles.callStatus} aria-live="polite">
                      {call.status === "Goncy está hablando…" || call.status === "Norma está hablando…" ? call.status : ""}
                    </p>
                  </div>
                  <div className={styles.callKeys}>
                    {/* The call module owns the microphone. These keys are the on-screen phone. */}
                    <button type="button" aria-pressed={muted} onClick={() => setMuted((value) => !value)}>
                      Silencio
                    </button>
                    <button type="button" aria-pressed={speaker} onClick={() => setSpeaker((value) => !value)}>
                      Altavoz
                    </button>
                    <button type="button" aria-pressed={padOpen} onClick={() => setPadOpen((value) => !value)}>
                      Teclado
                    </button>
                  </div>
                  {padOpen ? (
                    <div className={styles.keys}>
                      {KEYS.map((key) => (
                        <button key={key} type="button" onClick={() => setDigits((value) => (value + key).slice(0, 15))}>
                          {key}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <button type="button" className={styles.hangup} aria-label="Cortar" onClick={call.hangup}>
                    <Handset size={32} />
                  </button>
                </section>
              ) : null}

              {screen === "phone" && !inCall ? (
                <section className={styles.phone}>
                  <header className={styles.phoneHead}>
                    <button type="button" className={styles.iconHit} aria-label="Volver" onClick={goHome}>
                      <BackIcon />
                    </button>
                    Teléfono
                  </header>
                  <div className={styles.phoneBody}>
                    {tab === "contacts" ? (
                      <>
                        <button type="button" className={styles.favorite} onClick={dialGoncy}>
                          <span className={styles.avatar}><img src="/telefono/goncy.webp" alt="" width={96} height={96} decoding="async" /></span>
                          <span className={styles.who}>
                            <strong>Goncy</strong>
                            <span>Móvil</span>
                          </span>
                          <span className={styles.callRound} aria-hidden="true">
                            <Handset size={22} />
                          </span>
                        </button>
                      </>
                    ) : null}
                    {tab === "recents" ? (
                      <button type="button" className={styles.row} onClick={dialGoncy}>
                        <span className={styles.avatar}><img src="/telefono/goncy.webp" alt="" width={96} height={96} decoding="async" /></span>
                        <span className={styles.who}>
                          <strong>Goncy</strong>
                          <span>{call.phase === "ended" ? call.status : "Móvil"}</span>
                        </span>
                      </button>
                    ) : null}
                    {tab === "keypad" ? (
                      <div className={styles.keypad}>
                        <p className={styles.digits}>{digits || " "}</p>
                        <div className={styles.keys}>
                          {KEYS.map((key) => (
                            <button key={key} type="button" onClick={() => { setDigits((value) => (value + key).slice(0, 15)); setDialMiss(""); }}>
                              {key}
                            </button>
                          ))}
                          <button type="button" onClick={() => setDigits((value) => value.slice(0, -1))} aria-label="Borrar">
                            ⌫
                          </button>
                          <button type="button" className={styles.keyCall} onClick={dialFromKeys}>
                            Llamar
                          </button>
                          <span />
                        </div>
                        {dialMiss ? <p className={styles.miss}>{dialMiss}</p> : null}
                      </div>
                    ) : null}
                  </div>
                  <div className={styles.tabs}>
                    <button type="button" className={tab === "keypad" ? styles.tabOn : ""} onClick={() => setTab("keypad")}>
                      Teclado
                    </button>
                    <button type="button" className={tab === "recents" ? styles.tabOn : ""} onClick={() => setTab("recents")}>
                      Recientes
                    </button>
                    <button type="button" className={tab === "contacts" ? styles.tabOn : ""} onClick={() => setTab("contacts")}>
                      Contactos
                    </button>
                  </div>
                </section>
              ) : null}

              {screen === "chat" ? (
                <section className={styles.chat}>
                  <header className={styles.waHead}>
                    <button type="button" className={styles.iconHit} aria-label="Volver" onClick={goHome}>
                      <BackIcon />
                    </button>
                    <div className={styles.waWho}>
                      <span className={styles.waAvatar}><img src="/telefono/goncy.webp" alt="" width={96} height={96} decoding="async" /></span>
                      <span>
                        <strong>Goncy</strong>
                        <span>en línea</span>
                      </span>
                    </div>
                  </header>
                  <div className={styles.thread} ref={threadRef} aria-live="polite">
                    {messages.map((message) => (
                      <p key={message.id} className={`${styles.bubble} ${message.who === "norma" ? styles.out : styles.in}`}>
                        {message.imageUrl ? <img className={styles.shot} src={message.imageUrl} alt="" /> : null}
                        {message.text}
                        <span className={styles.meta}>
                          {message.time}
                          {message.who === "norma" ? (
                            <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
                              <path fill="none" stroke="#53bdeb" strokeWidth="1.6" d="M1 6.5 4 9.5 9 2M6 6.5 9 9.5 15 2" />
                            </svg>
                          ) : null}
                        </span>
                      </p>
                    ))}
                  </div>
                  {draft ? (
                    <div className={styles.attach}>
                      <img src={draft.preview} alt="" />
                      <button type="button" onClick={removeDraft}>
                        Sacar foto
                      </button>
                    </div>
                  ) : null}
                  {pickerOpen ? (
                    <div className={styles.picker} role="dialog" aria-label="Galería">
                      <div className={styles.pickerHead}>
                        <span>Galería</span>
                        <button type="button" aria-label="Cerrar galería" onClick={() => setPickerOpen(false)}>
                          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="currentColor" d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z" />
                          </svg>
                        </button>
                      </div>
                      <div className={styles.pickerGrid}>
                        {FOTOS.map((photo) => (
                          <button key={photo.id} type="button" aria-label={photo.title} disabled={pickingId !== null} onClick={() => void pickPhoto(photo)}>
                            <img src={photo.src} alt="" />
                            <span>{photo.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <form
                    className={styles.composer}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendChat();
                    }}
                  >
                    <button
                      type="button"
                      className={styles.iconHit}
                      aria-label="Adjuntar foto"
                      aria-expanded={pickerOpen}
                      onClick={() => setPickerOpen((open) => !open)}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="currentColor" d="M16.5 6.5 14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5zM8 14l2.2-2.8 1.6 2 2.2-2.8L18 15H8z" />
                      </svg>
                    </button>
                    <input
                      ref={cameraRef}
                      className={styles.fileInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) chooseFile(file);
                      }}
                    />
                    <textarea
                      className={styles.field}
                      rows={1}
                      placeholder="Mensaje"
                      value={text}
                      maxLength={80}
                      onChange={(event) => setText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendChat();
                        }
                      }}
                    />
                    <button type="button" className={styles.iconHit} aria-label="Cámara" onClick={() => cameraRef.current?.click()}>
                      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="currentColor" d="M9 4h6l1.2 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.8L9 4zm3 5a4 4 0 1 0 .001 8.001A4 4 0 0 0 12 9z" />
                      </svg>
                    </button>
                    {text.trim() || draft ? (
                      <button type="submit" className={styles.send} aria-label="Enviar" disabled={sending}>
                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                          <path fill="currentColor" d="M3 11.5 21 3l-8.5 18-1.8-7.2z" />
                        </svg>
                      </button>
                    ) : (
                      <button type="button" className={styles.send} aria-label="Micrófono">
                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                          <path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z" />
                        </svg>
                      </button>
                    )}
                  </form>
                </section>
              ) : null}

              {screen === "camera" ? (
                <section className={styles.camera}>
                  <video
                    ref={viewfinderRef}
                    className={styles.viewfinder}
                    src="/api/telefono/clip"
                    autoPlay
                    muted={!hearClip}
                    loop
                    playsInline
                  />
                  {flash ? <div className={styles.flash} /> : null}
                  <p className={styles.rec}>
                    <span className={styles.recDot} />
                    {elapsedText(rollSeconds)}
                  </p>
                  <div className={styles.cameraChrome}>
                    <button type="button" className={styles.shutter} aria-label="Sacar foto" onClick={tapShutter}>
                      <span />
                    </button>
                    <p className={styles.modes}>
                      <span>VIDEO</span>
                      <span className={styles.modeOn}>FOTO</span>
                      <span>RETRATO</span>
                    </p>
                  </div>
                </section>
              ) : null}

              {screen === "messages" && !client ? (
                <section className={styles.plain}>
                  <header className={styles.plainHead}>
                    <button type="button" className={styles.iconHit} aria-label="Volver" onClick={goHome}>
                      <BackIcon />
                    </button>
                    Mensajes
                  </header>
                  <div className={styles.inbox}>
                    {CLIENTES.map((item) => (
                      <button key={item.id} type="button" className={styles.smsRow} onClick={() => setOpenClient(item.id)}>
                        <span className={styles.smsAvatar} style={{ background: item.color }}>{item.initial}</span>
                        <span className={styles.smsMain}>
                          <span className={styles.smsTop}>
                            <strong>{item.name}</strong>
                            <span>{item.when}</span>
                          </span>
                          <span className={styles.smsBarrio}>{item.barrio}</span>
                          <span className={styles.smsPreview}>{item.preview}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {screen === "messages" && client ? (
                <section className={styles.plain}>
                  <header className={styles.plainHead}>
                    <button type="button" className={styles.iconHit} aria-label="Volver" onClick={() => setOpenClient(null)}>
                      <BackIcon />
                    </button>
                    <span className={styles.smsHead}>
                      <strong>{client.name}</strong>
                      <span>{client.barrio}</span>
                    </span>
                  </header>
                  <div className={styles.smsThread}>
                    {client.messages.map((message) => (
                      <p key={message.id} className={styles.smsBubble}>
                        {message.text}
                        <span className={styles.smsTime}>{message.time}</span>
                      </p>
                    ))}
                  </div>
                </section>
              ) : null}

              {screen === "gallery" ? (
                <section className={styles.plain}>
                  <header className={styles.plainHead}>
                    <button type="button" className={styles.iconHit} aria-label="Volver" onClick={goHome}>
                      <BackIcon />
                    </button>
                    Galería
                  </header>
                  <div className={styles.album}>
                    <p className={styles.albumDay}>Hoy</p>
                    <div className={styles.albumGrid}>
                      {FOTOS.map((photo) => (
                        <figure key={photo.id} className={styles.albumItem}>
                          <img src={photo.src} alt={photo.title} />
                          <figcaption>{photo.title}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}

              {screen === "clock" ? (
                <section className={styles.plain}>
                  <header className={styles.plainHead}>
                    <button type="button" className={styles.iconHit} aria-label="Volver" onClick={goHome}>
                      <BackIcon />
                    </button>
                    Reloj
                  </header>
                  <p className={styles.clockFace}>{time || " "}</p>
                  <h2 className={styles.alarmTitle}>Alarmas</h2>
                  <div className={styles.alarmList}>
                    {PASTILLAS.map((alarm) => {
                      const on = alarmsOn[alarm.id] !== false;
                      return (
                        <div key={alarm.id} className={on ? styles.alarmRow : `${styles.alarmRow} ${styles.alarmOff}`}>
                          <p className={styles.alarmTime}>{alarm.time}</p>
                          <p className={styles.alarmLabel}>{alarm.label}</p>
                          <p className={styles.alarmDays}>{alarm.days}</p>
                          <button
                            type="button"
                            className={styles.alarmSwitch}
                            aria-pressed={on}
                            aria-label={`${on ? "Apagar" : "Prender"} ${alarm.label}`}
                            onClick={() => setAlarmsOn((current) => ({ ...current, [alarm.id]: !on }))}
                          >
                            <span />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {recentsOpen ? (
                <div className={styles.sheet}>
                  <div className={styles.sheetCard}>
                    <button type="button" onClick={openPhone}>Teléfono</button>
                    <button type="button" onClick={() => { setRecentsOpen(false); setScreen("chat"); }}>WhatsApp</button>
                  </div>
                </div>
              ) : null}
            </div>
            <NavBar
              dark={screen === "camera"}
              backEnabled={screen !== "home" || recentsOpen}
              onBack={() => {
                if (recentsOpen) setRecentsOpen(false);
                else if (screen === "messages" && openClient) setOpenClient(null);
                else goHome();
              }}
              onHome={goHome}
              onRecents={() => setRecentsOpen(true)}
            />
          </div>
        </div>
        </div>
        <Nota />
        </div>
      </div>
    </main>
  );
}
