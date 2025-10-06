import Phaser from "phaser";
import { UIPanel } from "../ui/panel";
import { NetworkClient } from "../ui/net";
import type { ServerMessage } from "@game/protocol";
import type { SerializableState, RuleSet } from "@game/engine";

export default class RoomScene extends Phaser.Scene {
  private network!: NetworkClient;
  private playerPanel!: UIPanel;
  private rulesPanel!: UIPanel;
  private currentState: SerializableState | null = null;
  private lastHand: unknown = null;
  private stateHandler = (message: Extract<ServerMessage, { type: "state" }>) => this.onState(message);
  private errorHandler = (message: Extract<ServerMessage, { type: "error" }>) => this.toast(message.message);
  private tornDown = false;

  constructor() {
    super({ key: "Room" });
  }

  create(): void {
    this.network = this.registry.get("network") as NetworkClient;
    this.playerPanel = new UIPanel("room-players", "Players");
    this.rulesPanel = new UIPanel("room-rules", "Rules");
    this.network.on("state", this.stateHandler);
    this.network.on("error", this.errorHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);

    const snapshot = this.network.getLastState();
    if (snapshot) {
      this.onState(snapshot);
    }
  }

  private handleShutdown(): void {
    if (this.tornDown) {
      return;
    }
    this.tornDown = true;
    this.network.off("state", this.stateHandler);
    this.network.off("error", this.errorHandler);
    this.playerPanel.destroy();
    this.rulesPanel.destroy();
  }

  private onState(message: Extract<ServerMessage, { type: "state" }>): void {
    this.currentState = message.state as SerializableState;
    this.lastHand = message.hand ?? null;
    if (!this.currentState) {
      return;
    }
    if (this.currentState.phase === "inGame") {
      this.registry.set("lastState", this.currentState);
      this.registry.set("lastHand", this.lastHand);
      this.handleShutdown();
      this.scene.start("Game");
      return;
    }
    this.renderPlayers();
    this.renderRules();
  }

  private renderPlayers(): void {
    if (!this.currentState) {
      return;
    }
    const list = this.currentState.players
      .filter((player) => !player.isSpectator)
      .map((player, idx) => {
        const turn = idx === this.currentState?.currentPlayerIndex ? "(turn)" : "";
        const status = player.connected ? "online" : "offline";
        return `<div><strong>${player.name}</strong> - ${player.cardCount} cards ${turn} <small>${status}</small></div>`;
      })
      .join("");
    const spectators = this.currentState.players.filter((p) => p.isSpectator);
    const spectatorLine = spectators.length > 0 ? `<div class="spectators">Spectators: ${spectators
      .map((s) => s.name)
      .join(", ")}</div>` : "";
    this.playerPanel.setHTML((list || "Waiting for players...") + spectatorLine);
  }

  private renderRules(): void {
    if (!this.currentState) {
      return;
    }
    const rules = this.currentState.ruleSet;
    const disabled = this.currentState.phase !== "lobby";
    this.rulesPanel.setHTML(`
      <label>
        <input type="checkbox" id="toggle-stacking" ${rules.stacking !== "off" ? "checked" : ""} ${disabled ? "disabled" : ""} />
        Enable stacking
      </label>
      <label>
        <input type="checkbox" id="toggle-jumpin" ${rules.jumpIn.enabled ? "checked" : ""} ${disabled ? "disabled" : ""} />
        Allow jump-in
      </label>
      <label>
        <input type="checkbox" id="toggle-sevenzero" ${rules.sevenZero ? "checked" : ""} ${disabled ? "disabled" : ""} />
        Seven & Zero rule
      </label>
      <label>
        <input type="checkbox" id="toggle-unoflip" ${rules.variant === "unoFlip" ? "checked" : ""} ${disabled ? "disabled" : ""} />
        UNO Flip variant
      </label>
      <button id="start-game" ${this.currentState.players.filter((p) => !p.isSpectator).length < 2 || disabled ? "disabled" : ""}>Start Game</button>
    `);

    const stackingCheckbox = this.rulesPanel.getEl().querySelector<HTMLInputElement>("#toggle-stacking");
    stackingCheckbox?.addEventListener("change", () => {
      const next: RuleSet = {
        ...rules,
        stacking: stackingCheckbox.checked ? "anyDrawStacks" : "off",
      };
      this.applyRules(next);
    });
    const jumpInCheckbox = this.rulesPanel.getEl().querySelector<HTMLInputElement>("#toggle-jumpin");
    jumpInCheckbox?.addEventListener("change", () => {
      const next = { ...rules, jumpIn: { ...rules.jumpIn, enabled: jumpInCheckbox.checked } };
      this.applyRules(next);
    });
    const sevenZeroCheckbox = this.rulesPanel.getEl().querySelector<HTMLInputElement>("#toggle-sevenzero");
    sevenZeroCheckbox?.addEventListener("change", () => {
      const next = { ...rules, sevenZero: sevenZeroCheckbox.checked };
      this.applyRules(next);
    });
    const flipCheckbox = this.rulesPanel.getEl().querySelector<HTMLInputElement>("#toggle-unoflip");
    flipCheckbox?.addEventListener("change", () => {
      const next = { ...rules, variant: flipCheckbox.checked ? "unoFlip" : "base" };
      this.applyRules(next);
    });
    const startButton = this.rulesPanel.getEl().querySelector<HTMLButtonElement>("#start-game");
    startButton?.addEventListener("click", () => {
      this.network.send({ type: "startGame" }).catch((err) => this.toast(err.message ?? "Unable to start"));
    });
  }

  private applyRules(next: RuleSet): void {
    this.network.send({ type: "setRules", rules: next }).catch((err) => this.toast(err.message ?? "Failed to set rules"));
  }

  private toast(text: string): void {
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
}
