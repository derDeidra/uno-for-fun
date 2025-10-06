import Phaser from "phaser";
import { UIPanel } from "../ui/panel";
import { NetworkClient } from "../ui/net";
import type { ServerMessage } from "@game/protocol";

export default class LobbyScene extends Phaser.Scene {
  private network!: NetworkClient;
  private panel!: UIPanel;
  private joinedHandler = (message: Extract<ServerMessage, { type: "joined" }>) => this.onJoined(message);
  private errorHandler = (message: Extract<ServerMessage, { type: "error" }>) => this.showToast(message.message);
  private tornDown = false;

  constructor() {
    super({ key: "Lobby" });
  }

  create(): void {
    this.network = this.registry.get("network") as NetworkClient;
    this.panel = new UIPanel("lobby-panel", "Join Table");
    this.panel.setHTML(`
      <div class="form-field">
        <label for="player-name">Display Name</label>
        <input id="player-name" type="text" maxlength="40" value="Player" />
      </div>
      <div class="form-field">
        <label for="room-code">Room Code</label>
        <input id="room-code" type="text" maxlength="8" value="uno" />
      </div>
      <div class="checkbox-row">
        <input id="spectator" type="checkbox" />
        <span>Join as spectator</span>
      </div>
      <button id="join-btn">Join</button>
      <div id="status" class="status-text"></div>
    `);
    this.panel.setVisible(true);

    const joinBtn = this.panel.getEl().querySelector<HTMLButtonElement>("#join-btn");
    joinBtn?.addEventListener("click", () => this.join());
    this.network.on("joined", this.joinedHandler);
    this.network.on("error", this.errorHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
  }

  private handleShutdown(): void {
    if (this.tornDown) {
      return;
    }
    this.tornDown = true;
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
    this.time.delayedCall(300, () => {
      this.handleShutdown();
      this.scene.start("Room");
    });
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
