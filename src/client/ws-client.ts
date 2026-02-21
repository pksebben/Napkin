import type { ClientMessage, ServerMessage } from "../shared/types";

export type MessageHandler = (msg: ServerMessage) => void;

const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 2000;

export class NapkinSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(url: string): void {
    // Clean up previous connection
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectDelay = INITIAL_RECONNECT_DELAY;
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        for (const handler of this.handlers) {
          handler(msg);
        }
      } catch (err) {
        console.error("Invalid WS message:", err);
      }
    };

    this.ws.onclose = () => {
      console.log(`WebSocket closed, reconnecting in ${this.reconnectDelay / 1000}s...`);
      this.reconnectTimer = setTimeout(() => this.connect(url), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
    };

    this.ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
