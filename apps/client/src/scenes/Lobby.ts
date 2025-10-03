import Phaser from "phaser";
import { UIPanel } from "../ui/panel";
import { NetworkClient } from "../ui/net";
import type { ServerMessage } from "@game/protocol";

export default class LobbyScene extends Phaser.Scene {
  private network!: NetworkClient;
  private panel!: UIPanel;
  private joinedHandler = (message: Extract<ServerMessage, { type: "joined" }>) => this.onJoined(message);
  private errorHandler = (message: Extract<ServerMessage, { type: "error" }>) => this.showToast(message.message);

  constructor() {
    super({ key: "Lobby" });
  }

  create(): void {
    this.network = this.registry.get("network") as NetworkClient;
    this.panel = new UIPanel("lobby-panel", "Join Table");
    this.panel.setHTML(`
      <label>Display Name
        <input id="player-name" type="text" maxlength="40" value="Player" />
      </label>
      <label>Room Code
        <input id="room-code" type="text" maxlength="8" value="uno" />
      </label>
      <label>
        <input id="spectator" type="checkbox" />
        Join as spectator
      </label>
      <button id="join-btn">Join</button>
      <div id="status" style="margin-top:8px;font-size:12px;color:#ccc;"></div>
    `);
    this.panel.setVisible(true);

    const joinBtn = this.panel.getEl().querySelector<HTMLButtonElement>("#join-btn");
    joinBtn?.addEventListener("click", () => this.join());
    this.network.on("joined", this.joinedHandler);
    this.network.on("error", this.errorHandler);
  }

  shutdown(): void {
    this.network.off("joined", this.joinedHandler);
    this.network.off("error", this.errorHandler);
    this.panel.destroy();
  }

  private async join(): Promise<void> {
    const nameInput = this.panel.getEl().querySelector<HTMLInputElement>("#player-name");
    const roomInput = this.panel.getEl().querySelector<HTMLInputElement>("#room-code");
    const spectatorInput = this.panel.getEl().querySelector<HTMLInputElement>("#spectator");
    if (!nameInput || !roomInput || !spectatorInput) {
      return;
    }
    const token = localStorage.getItem("uno-token") ?? undefined;
    try {
      await this.network.join({
        type: "joinRoom",
        name: nameInput.value || "Player",
        roomCode: roomInput.value || "uno",
        spectator: spectatorInput.checked,
        token,
      });
      this.updateStatus("Joining room...");
    } catch (err: any) {
      this.showToast(err.message ?? "Failed to join");
    }
  }

  private onJoined(message: Extract<ServerMessage, { type: "joined" }>): void {
    localStorage.setItem("uno-token", message.token);
    this.registry.set("playerId", message.playerId);
    this.updateStatus(`Joined as ${message.playerId}`);
    this.time.delayedCall(300, () => this.scene.start("Room"));
  }

  private showToast(text: string): void {
    let toast = document.querySelector<HTMLDivElement>(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.innerText = text;
    toast.style.opacity = "1";
    setTimeout(() => {
      toast && (toast.style.opacity = "0");
    }, 1800);
  }

  private updateStatus(text: string): void {
    const status = this.panel.getEl().querySelector<HTMLDivElement>("#status");
    if (status) {
      status.innerText = text;
    }
  }
}
