const CHANNEL = "vitrina";

export function notifyVitrina(): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage("changed");
    channel.close();
  } catch {
    // The open catalog tab keeps polling.
  }
}

export function listenVitrina(onChange: () => void): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => onChange();
  } catch {
    channel = null;
  }
  return () => channel?.close();
}
