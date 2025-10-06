import Phaser from "phaser";
import { NetworkClient } from "../ui/net";
import type { ServerMessage } from "@game/protocol";
import type { SerializableState, CardFace, Face, RuleSet } from "@game/engine";
import { cardFrameFor, deckBackFrame } from "../ui/assets";

interface HandCardView {
  id: string;
  light: CardFace;
  dark: CardFace;
}

export default class GameScene extends Phaser.Scene {
  private network!: NetworkClient;
  private state: SerializableState | null = null;
  private hand: HandCardView[] = [];
  private discardSprite?: Phaser.GameObjects.Image;
  private deckBack?: Phaser.GameObjects.Image;
  private turnText!: Phaser.GameObjects.Text;
  private spectatorText!: Phaser.GameObjects.Text;
  private playerNodes: Phaser.GameObjects.Container[] = [];
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
    this.actionPanel.className = "ui-panel action-panel";
    document.body.appendChild(this.actionPanel);

    this.turnText = this.add
      .text(this.scale.width / 2, 32, "Waiting for players...", {
        fontSize: "24px",
        color: "#f5f3ff",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(5);

    this.spectatorText = this.add
      .text(this.scale.width - 24, this.scale.height - 24, "", {
        fontSize: "14px",
        color: "#cfcde8",
      })
      .setOrigin(1, 1)
      .setDepth(5);

    this.network.on("state", this.stateHandler);
    this.network.on("error", this.errorHandler);
    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);

    const lastState = this.registry.get("lastState") as SerializableState | undefined;
    const lastHand = this.registry.get("lastHand") as HandCardView[] | undefined;
    if (lastState) {
      this.state = lastState;
      this.hand = lastHand ?? [];
      this.render();
    }
  }

  private get variant(): RuleSet["variant"] {
    return this.state?.ruleSet.variant ?? "base";
  }

  private handleShutdown(): void {
    this.network.off("state", this.stateHandler);
    this.network.off("error", this.errorHandler);
    this.scale.off("resize", this.handleResize, this);
    this.handContainer.remove();
    this.actionPanel.remove();
    this.playerNodes.forEach((node) => node.destroy());
    this.playerNodes = [];
  }

  private handleResize(): void {
    this.turnText.setPosition(this.scale.width / 2, 32);
    this.spectatorText.setPosition(this.scale.width - 24, this.scale.height - 24);
    this.render();
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
    this.renderTurnBanner();
    this.renderDeck();
    this.renderPlayers();
    this.renderSpectators();
    this.renderHand();
    this.renderActions();
  }

  private renderTurnBanner(): void {
    if (!this.state) {
      return;
    }
    const current = this.state.players[this.state.currentPlayerIndex];
    const name = current ? current.name : "Waiting";
    const suffix = current?.id === this.playerId ? " (You)" : "";
    this.turnText.setText(`Turn: ${name}${suffix}`);
    this.turnText.setTint(current?.id === this.playerId ? 0xf2d94c : 0xf5f3ff);
  }

  private renderDeck(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    const activeFace = this.state?.activeFace ?? "light";
    const backFrame = deckBackFrame(activeFace, this.variant);

    if (!this.deckBack) {
      if (backFrame) {
        this.deckBack = this.add.image(centerX - 120, centerY, backFrame.textureKey, backFrame.frame);
      } else {
        this.deckBack = this.add.image(centerX - 120, centerY, activeFace === "dark" ? "card-dark" : "card-ruby");
      }
      this.deckBack.setOrigin(0.5);
      this.deckBack.setDisplaySize(140, 210);
      this.deckBack.setDepth(2);
    } else {
      if (backFrame) {
        this.deckBack.setTexture(backFrame.textureKey, backFrame.frame);
      } else {
        this.deckBack.setTexture(activeFace === "dark" ? "card-dark" : "card-ruby");
      }
      this.deckBack.setPosition(centerX - 120, centerY);
    }

    if (!this.discardSprite) {
      this.discardSprite = this.add.image(centerX + 120, centerY, "card-ruby");
      this.discardSprite.setOrigin(0.5);
      this.discardSprite.setDisplaySize(140, 210);
      this.discardSprite.setDepth(3);
    }

    if (this.state?.topDiscard) {
      const frame = cardFrameFor(this.state.topDiscard, this.variant);
      if (frame) {
        this.discardSprite.setTexture(frame.textureKey, frame.frame);
      } else {
        this.discardSprite.setTexture(this.fallbackTextureKey(this.state.topDiscard));
      }
      this.discardSprite.setVisible(true);
      this.discardSprite.setPosition(centerX + 120, centerY);
    } else {
      this.discardSprite.setVisible(false);
    }
  }

  private renderPlayers(): void {
    if (!this.state) {
      return;
    }
    this.playerNodes.forEach((node) => node.destroy());
    this.playerNodes = [];

    const players = this.state.players.filter((p) => !p.isSpectator);
    if (players.length === 0) {
      return;
    }
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    const radius = Math.max(Math.min(this.scale.width, this.scale.height) * 0.35, 160);
    const angleStep = (Math.PI * 2) / players.length;
    const currentId = this.state.players[this.state.currentPlayerIndex]?.id;

    players.forEach((player, index) => {
      const angle = -Math.PI / 2 + angleStep * index;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const container = this.add.container(x, y);
      container.setDepth(4);

      const isCurrent = player.id === currentId;
      const isLocal = player.id === this.playerId;
      const fill = isCurrent ? 0xf2d94c : 0x2c2a44;
      const border = isCurrent ? 0xf9f0a6 : 0x514f7a;

      const panel = this.add.rectangle(0, 0, 180, 90, fill, isCurrent ? 0.92 : 0.78);
      panel.setStrokeStyle(2, border, 1);
      panel.setOrigin(0.5);

      const nameText = this.add
        .text(0, -18, `${player.name}${isLocal ? " (You)" : ""}`, {
          fontSize: "18px",
          color: isCurrent ? "#1d1b2f" : "#f2f2ff",
          fontStyle: isCurrent ? "bold" : "normal",
          align: "center",
        })
        .setOrigin(0.5, 0.5);

      const cardLabel = player.cardCount === 1 ? "card" : "cards";
      const cardsText = this.add
        .text(0, 8, `${player.cardCount} ${cardLabel}`, {
          fontSize: "16px",
          color: isCurrent ? "#1d1b2f" : "#d4d0ff",
        })
        .setOrigin(0.5, 0.5);

      let unoText: Phaser.GameObjects.Text | undefined;
      if (player.cardCount === 1 && !player.unoDeclared) {
        unoText = this.add
          .text(0, 34, "UNO!", {
            fontSize: "16px",
            color: "#ff5370",
            fontStyle: "bold",
          })
          .setOrigin(0.5, 0.5);
      } else if (player.unoDeclared) {
        unoText = this.add
          .text(0, 34, "UNO declared", {
            fontSize: "14px",
            color: "#7cf29d",
          })
          .setOrigin(0.5, 0.5);
      }

      container.add([panel, nameText, cardsText]);
      if (unoText) {
        container.add(unoText);
      }
      this.playerNodes.push(container);
    });
  }

  private renderSpectators(): void {
    if (!this.state) {
      return;
    }
    const spectators = this.state.players.filter((p) => p.isSpectator);
    if (spectators.length === 0) {
      this.spectatorText.setText("");
      return;
    }
    const names = spectators.map((p) => p.name).join(", ");
    this.spectatorText.setText(`Spectators: ${names}`);
  }

  private renderHand(): void {
    this.handContainer.innerHTML = "";
    const activeFace = this.state?.activeFace ?? "light";

    for (const card of this.hand) {
      const face = activeFace === "dark" ? card.dark : card.light;
      const frame = cardFrameFor(face, this.variant);
      const cardEl = document.createElement("div");
      cardEl.className = "card";
      cardEl.dataset.cardId = card.id;
      cardEl.title =
        face.kind === "number"
          ? `${face.color} ${face.value}`
          : `${face.color} ${face.action ?? "Wild"}`;
      cardEl.addEventListener("click", () => this.playCard(card));

      if (frame) {
        const targetHeight = 128;
        const scale = targetHeight / frame.rect.h;
        const width = Math.round(frame.rect.w * scale);
        cardEl.style.width = `${width}px`;
        cardEl.style.height = `${Math.round(targetHeight)}px`;
        cardEl.style.backgroundImage = `url(${frame.imageUrl})`;
        cardEl.style.backgroundSize = `${frame.imageSize.w * scale}px ${frame.imageSize.h * scale}px`;
        cardEl.style.backgroundPosition = `${-frame.rect.x * scale}px ${-frame.rect.y * scale}px`;
        cardEl.style.backgroundRepeat = "no-repeat";
        cardEl.style.backgroundColor = "transparent";
        cardEl.style.backgroundBlendMode = "normal";
        cardEl.style.color = "transparent";
        cardEl.textContent = "";
      } else {
        const gradient = this.cardBackground(face);
        cardEl.style.width = "74px";
        cardEl.style.height = "112px";
        cardEl.style.backgroundImage = gradient;
        cardEl.style.backgroundSize = "cover";
        cardEl.style.backgroundPosition = "center";
        cardEl.style.backgroundColor = "#111";
        cardEl.style.backgroundRepeat = "no-repeat";
        cardEl.style.backgroundBlendMode = "normal";
        cardEl.style.color = "#fff";
        cardEl.textContent = face.kind === "number" ? `${face.value}` : face.action ?? "W";
      }

      this.handContainer.appendChild(cardEl);
    }
  }

  private renderActions(): void {
    this.actionPanel.innerHTML = `
      <button id="uno-btn">UNO</button>
      <button id="catch-btn">Catch UNO</button>
    `;
    this.actionPanel
      .querySelector<HTMLButtonElement>("#uno-btn")
      ?.addEventListener("click", () => {
        this.network.send({ type: "callUno" }).catch((err) => this.toast(err.message ?? "UNO failed"));
      });
    this.actionPanel
      .querySelector<HTMLButtonElement>("#catch-btn")
      ?.addEventListener("click", () => {
        const target = prompt("Player ID to catch?");
        if (target) {
          this.network
            .send({ type: "catchUno", targetPlayerId: target })
            .catch((err) => this.toast(err.message ?? "Catch failed"));
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

  private fallbackTextureKey(face: CardFace): string {
    const map: Record<string, string> = {
      Ruby: "card-ruby",
      Azure: "card-azure",
      Emerald: "card-emerald",
      Sunshine: "card-sunshine",
      Amethyst: "card-dark",
      Cerulean: "card-dark",
      Saffron: "card-dark",
      Obsidian: "card-dark",
      Wild: "card-dark",
    };
    return map[face.color as keyof typeof map] ?? "card-dark";
  }

  private cardBackground(face: CardFace): string {
    const gradients: Record<string, string> = {
      Ruby: "linear-gradient(135deg,rgba(255,77,77,0.85),rgba(179,18,23,0.95))",
      Azure: "linear-gradient(135deg,rgba(0,136,255,0.85),rgba(13,71,161,0.95))",
      Emerald: "linear-gradient(135deg,rgba(0,200,83,0.85),rgba(27,94,32,0.95))",
      Sunshine: "linear-gradient(135deg,rgba(255,221,0,0.85),rgba(255,145,0,0.95))",
      Amethyst: "linear-gradient(135deg,rgba(142,36,170,0.85),rgba(74,20,140,0.95))",
      Cerulean: "linear-gradient(135deg,rgba(0,176,255,0.85),rgba(1,87,155,0.95))",
      Saffron: "linear-gradient(135deg,rgba(253,216,53,0.85),rgba(255,111,0,0.95))",
      Obsidian: "linear-gradient(135deg,rgba(55,71,79,0.85),rgba(0,0,0,0.95))",
      Wild: "linear-gradient(135deg,rgba(255,255,255,0.85),rgba(0,0,0,0.75))",
    };
    return gradients[face.color as keyof typeof gradients] ?? "linear-gradient(135deg,#555,#222)";
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
