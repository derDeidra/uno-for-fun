import Phaser from "phaser";
import { NetworkClient } from "../ui/net";
import type { ServerMessage } from "@game/protocol";
import type { SerializableState, CardFace, Face } from "@game/engine";
import { textureFor } from "../ui/assets";

interface HandCardView {
  id: string;
  light: CardFace;
  dark: CardFace;
}

export default class GameScene extends Phaser.Scene {
  private network!: NetworkClient;
  private state: SerializableState | null = null;
  private hand: HandCardView[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private discardSprite?: Phaser.GameObjects.Image;
  private handContainer!: HTMLDivElement;
  private actionPanel!: HTMLDivElement;
  private playerId!: string;
  private stateHandler = (message: Extract<ServerMessage, { type: "state" }>) => this.onState(message);
  private errorHandler = (message: Extract<ServerMessage, { type: "error" }>) => this.toast(message.message);

  constructor() {
    super({ key: "Game" });
  }

  create(): void {
    this.network = this.registry.get("network") as NetworkClient;
    this.playerId = this.registry.get("playerId");
    this.handContainer = document.createElement("div");
    this.handContainer.className = "hand-container";
    document.body.appendChild(this.handContainer);
    this.actionPanel = document.createElement("div");
    this.actionPanel.className = "ui-panel";
    this.actionPanel.style.position = "absolute";
    this.actionPanel.style.bottom = "160px";
    this.actionPanel.style.right = "20px";
    document.body.appendChild(this.actionPanel);

    this.scoreText = this.add.text(20, 20, "Waiting for state...", {
      fontSize: "18px",
      color: "#ffffff",
    });

    this.network.on("state", this.stateHandler);
    this.network.on("error", this.errorHandler);

    const lastState = this.registry.get("lastState") as SerializableState | undefined;
    const lastHand = this.registry.get("lastHand") as HandCardView[] | undefined;
    if (lastState) {
      this.state = lastState;
      this.hand = lastHand ?? [];
      this.render();
    }
  }

  shutdown(): void {
    this.network.off("state", this.stateHandler);
    this.network.off("error", this.errorHandler);
    this.handContainer.remove();
    this.actionPanel.remove();
  }

  private onState(message: Extract<ServerMessage, { type: "state" }>): void {
    this.state = message.state as SerializableState;
    this.hand = (message.hand as HandCardView[]) ?? this.hand;
    this.render();
    if (this.state.phase === "finished") {
      this.registry.set("winners", this.state.winnerIds);
      this.time.delayedCall(500, () => this.scene.start("Results"));
    }
  }

  private render(): void {
    if (!this.state) {
      return;
    }
    const lines = this.state.players
      .map((player, idx) => {
        const you = player.id === this.playerId ? "*" : "";
        const turn = idx === this.state?.currentPlayerIndex ? " ▶" : "";
        return `${you}${player.name}: ${player.cardCount}${turn}`;
      })
      .join("\n");
    this.scoreText.setText(lines);
    this.renderDiscard();
    this.renderHand();
    this.renderActions();
  }

  private renderDiscard(): void {
    if (!this.state?.topDiscard) {
      return;
    }
    if (!this.discardSprite) {
      this.discardSprite = this.add.image(this.scale.width / 2, this.scale.height / 2, "card-ruby").setOrigin(0.5);
    }
    const texture = textureFor(this.state.topDiscard.color, this.state.activeFace as Face);
    this.discardSprite.setTexture(texture);
    this.discardSprite.setPosition(this.scale.width / 2, this.scale.height / 2);
  }

  private renderHand(): void {
    this.handContainer.innerHTML = "";
    for (const card of this.hand) {
      const face = this.state?.activeFace === "dark" ? card.dark : card.light;
      const cardEl = document.createElement("div");
      cardEl.className = "card";
      cardEl.style.background = this.cardBackground(face);
      cardEl.dataset.cardId = card.id;
      cardEl.innerText = face.kind === "number" ? `${face.value}` : face.action ?? "W";
      cardEl.addEventListener("click", () => this.playCard(card));
      this.handContainer.appendChild(cardEl);
    }
  }

  private renderActions(): void {
    this.actionPanel.innerHTML = `
      <button id="draw-btn">Draw</button>
      <button id="pass-btn">Pass</button>
      <button id="uno-btn">UNO</button>
      <button id="catch-btn">Catch UNO</button>
    `;
    this.actionPanel.querySelector<HTMLButtonElement>("#draw-btn")?.addEventListener("click", () => {
      this.network.send({ type: "drawCard" }).catch((err) => this.toast(err.message ?? "Draw failed"));
    });
    this.actionPanel.querySelector<HTMLButtonElement>("#pass-btn")?.addEventListener("click", () => {
      this.network.send({ type: "pass" }).catch((err) => this.toast(err.message ?? "Pass failed"));
    });
    this.actionPanel.querySelector<HTMLButtonElement>("#uno-btn")?.addEventListener("click", () => {
      this.network.send({ type: "callUno" }).catch((err) => this.toast(err.message ?? "UNO failed"));
    });
    this.actionPanel.querySelector<HTMLButtonElement>("#catch-btn")?.addEventListener("click", () => {
      const target = prompt("Player ID to catch?");
      if (target) {
        this.network.send({ type: "catchUno", targetPlayerId: target }).catch((err) => this.toast(err.message ?? "Catch failed"));
      }
    });
  }

  private async playCard(card: HandCardView): Promise<void> {
    if (!this.state) {
      return;
    }
    const face = this.state.activeFace === "dark" ? card.dark : card.light;
    let chosenColor: string | undefined;
    if (face.kind === "wild") {
      chosenColor = prompt("Choose color (Ruby, Azure, Emerald, Sunshine)") ?? undefined;
    }
    let targetPlayerId: string | undefined;
    const needsTarget =
      (face.kind === "number" && face.value === 7 && this.state.ruleSet.sevenZero) ||
      face.action === "SwapHands";
    if (needsTarget) {
      targetPlayerId = prompt("Target player ID") ?? undefined;
      if (!targetPlayerId) {
        this.toast("Target required");
        return;
      }
    }
    try {
      await this.network.send({
        type: "playCard",
        cardId: card.id,
        chosenColor: chosenColor as any,
        targetPlayerId,
      });
    } catch (err: any) {
      this.toast(err.message ?? "Play failed");
    }
  }

  private cardBackground(face: CardFace): string {
    const colorMap: Record<string, string> = {
      Ruby: "linear-gradient(135deg,#ff4d4d,#b31217)",
      Azure: "linear-gradient(135deg,#0088ff,#0d47a1)",
      Emerald: "linear-gradient(135deg,#00c853,#1b5e20)",
      Sunshine: "linear-gradient(135deg,#ffdd00,#ff9100)",
      Amethyst: "linear-gradient(135deg,#8e24aa,#4a148c)",
      Cerulean: "linear-gradient(135deg,#00b0ff,#01579b)",
      Saffron: "linear-gradient(135deg,#fdd835,#ff6f00)",
      Obsidian: "linear-gradient(135deg,#37474f,#000000)",
      Wild: "linear-gradient(135deg,#ffffff,#000000)",
    };
    return colorMap[face.color as keyof typeof colorMap] ?? "#444";
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
