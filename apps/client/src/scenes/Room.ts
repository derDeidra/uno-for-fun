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

    const playerId = this.registry.get("playerId") as string | undefined;
    const hostId = this.getHostPlayerId();

    const activePlayers = this.currentState.players.filter((player) => !player.isSpectator);

    const list = activePlayers

      .map((player) => {

        const labels: string[] = [];
        if (player.id === hostId) {
          labels.push(`<span class="player-tag">Host</span>`);
        }
        if (playerId && player.id === playerId) {
          labels.push(`<span class="player-tag player-tag--self">You</span>`);
        }
        return `<li class="player-entry"><span class="player-name">${player.name}</span>${labels.join("")}</li>`;

      })

      .join("");

    const spectators = this.currentState.players.filter((p) => p.isSpectator);

    const spectatorLine = spectators.length > 0

      ? `<p class="player-spectators">Spectators: ${spectators.map((s) => s.name).join(", ")}</p>`

      : "";

    this.playerPanel.setHTML(`

      <ul class="player-list">

        ${list || '<li class="player-entry player-entry--empty">Waiting for players...</li>'}

      </ul>

      ${spectatorLine}

    `);

  }





  private renderRules(): void {

    if (!this.currentState) {

      return;

    }

    const rules = this.currentState.ruleSet;

    const playerId = this.registry.get("playerId") as string | undefined;

    const hostId = this.getHostPlayerId();

    const isHost = Boolean(playerId && hostId && playerId === hostId);

    const lobbyLocked = this.currentState.phase !== "lobby";

    const controlsDisabled = lobbyLocked || !isHost;

    const ruleDisabledAttr = controlsDisabled ? "disabled" : "";

    const activePlayers = this.currentState.players.filter((p) => !p.isSpectator).length;

    const startDisabled = activePlayers < 2;

    const startButtonHtml = isHost && !lobbyLocked

      ? `<button id="start-game" ${startDisabled ? "disabled" : ""}>Start Game</button>`

      : "";

    this.rulesPanel.setHTML(`

      <div class="rules-group">

        <label class="rule-option">

          <input type="checkbox" id="toggle-stacking" ${rules.stacking !== "off" ? "checked" : ""} ${ruleDisabledAttr} />

          <span>Enable stacking</span>

        </label>

        <label class="rule-option">

          <input type="checkbox" id="toggle-jumpin" ${rules.jumpIn.enabled ? "checked" : ""} ${ruleDisabledAttr} />

          <span>Allow jump-in</span>

        </label>

        <label class="rule-option">

          <input type="checkbox" id="toggle-sevenzero" ${rules.sevenZero ? "checked" : ""} ${ruleDisabledAttr} />

          <span>Seven & Zero rule</span>

        </label>

        <label class="rule-option">

          <input type="checkbox" id="toggle-unoflip" ${rules.variant === "unoFlip" ? "checked" : ""} ${ruleDisabledAttr} />

          <span>UNO Flip variant</span>

        </label>

      </div>

      ${startButtonHtml}

    `);



    if (controlsDisabled) {

      return;

    }



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

    const startButton = isHost && !lobbyLocked ? this.rulesPanel.getEl().querySelector<HTMLButtonElement>("#start-game") : null;

    startButton?.addEventListener("click", () => {

      this.network.send({ type: "startGame" }).catch((err) => this.toast(err.message ?? "Unable to start"));

    });

  }





  private getHostPlayerId(): string | null {

    if (!this.currentState) {

      return null;

    }

    const host = this.currentState.players.find((player) => !player.isSpectator);

    return host?.id ?? null;

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
