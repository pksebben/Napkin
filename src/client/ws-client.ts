import type { ClientMessage, ServerMessage } from "../shared/types";

export type MessageHandler = (msg: ServerMessage) => void;

export class NapkinSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();

  connect(url: string): void {
    this.ws = new WebSocket(url);
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
      console.log("WebSocket closed, reconnecting in 2s...");
      setTimeout(() => this.connect(url), 2000);
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
