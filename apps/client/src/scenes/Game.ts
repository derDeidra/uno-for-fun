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
  private playerNodes: Phaser.GameObjects.GameObject[] = [];
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
    this.playerNodes.forEach((node) => {
      if (node instanceof Phaser.GameObjects.Container) {
        node.destroy(true);
      } else {
        node.destroy();
      }
    });
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

    const seated = this.state.players.filter((p) => !p.isSpectator);
    if (seated.length === 0) {
      return;
    }
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    const radius = Math.max(Math.min(this.scale.width, this.scale.height) * 0.35, 180);
    const previewRadius = Math.max(radius - 110, radius * 0.6);
    const angleStep = (Math.PI * 2) / seated.length;
    const currentId = this.state.players[this.state.currentPlayerIndex]?.id;
    const localIndex = seated.findIndex((player) => player.id === this.playerId);
    const orderedPlayers =
      localIndex >= 0
        ? [...seated.slice(localIndex), ...seated.slice(0, localIndex)]
        : seated;
    const baseAngle = localIndex >= 0 ? Math.PI / 2 : -Math.PI / 2;
    const revealOpposite = this.state.ruleSet.variant === "unoFlip";
    const activeFace = this.state.activeFace ?? "light";
    const previewBackFace =
      this.variant === "unoFlip" ? (activeFace === "light" ? "dark" : "light") : activeFace;

    orderedPlayers.forEach((player, displayIndex) => {
      const angle = baseAngle - angleStep * displayIndex;
      const seatX = centerX + Math.cos(angle) * radius;
      const seatY = centerY + Math.sin(angle) * radius;
      const container = this.add.container(seatX, seatY);
      container.setDepth(4);

      const isCurrent = player.id === currentId;
      const isLocal = player.id === this.playerId;
      const fill = isCurrent ? 0xf2d94c : 0x2c2a44;
      const border = isCurrent ? 0xf9f0a6 : 0x514f7a;

      const panel = this.add.rectangle(0, 0, 200, 96, fill, isCurrent ? 0.92 : 0.78);
      panel.setStrokeStyle(2, border, 1);
      panel.setOrigin(0.5);

      const nameText = this.add
        .text(0, -24, `${player.name}${isLocal ? " (You)" : ""}`, {
          fontSize: "18px",
          color: isCurrent ? "#1d1b2f" : "#f2f2ff",
          fontStyle: isCurrent ? "bold" : "normal",
          align: "center",
        })
        .setOrigin(0.5, 0.5);

      const cardLabel = player.cardCount === 1 ? "card" : "cards";
      const cardsText = this.add
        .text(0, 2, `${player.cardCount} ${cardLabel}`, {
          fontSize: "16px",
          color: isCurrent ? "#1d1b2f" : "#d4d0ff",
        })
        .setOrigin(0.5, 0.5);

      let unoText: Phaser.GameObjects.Text | undefined;
      if (player.cardCount === 1 && !player.unoDeclared) {
        unoText = this.add
          .text(0, 36, "UNO!", {
            fontSize: "16px",
            color: "#ff5370",
            fontStyle: "bold",
          })
          .setOrigin(0.5, 0.5);
      } else if (player.unoDeclared) {
        unoText = this.add
          .text(0, 36, "UNO declared", {
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

      if (!isLocal && player.cardCount > 0) {
        const previews = revealOpposite ? player.handPreview ?? [] : [];
        const previewContainer = this.renderPreviewHand(
          angle,
          centerX,
          centerY,
          previewRadius,
          previews,
          player.cardCount,
          previewBackFace
        );
        if (previewContainer) {
          this.playerNodes.push(previewContainer);
        }
      }
    });
  }

  private renderPreviewHand(
    angle: number,
    centerX: number,
    centerY: number,
    radius: number,
    previews: Array<{ id: string; face: CardFace }> | undefined,
    fallbackCount: number,
    activeFace: Face
  ): Phaser.GameObjects.Container | null {
    const previewCount = previews?.length ?? 0;
    const totalCards = previewCount > 0 ? previewCount : fallbackCount;
    if (totalCards <= 0) {
      return null;
    }
    const handX = centerX + Math.cos(angle) * radius;
    const handY = centerY + Math.sin(angle) * radius;
    const container = this.add.container(handX, handY);
    container.setDepth(3);

    const maxSpread = 180;
    const spacing = totalCards > 1 ? Math.min(34, maxSpread / (totalCards - 1)) : 0;
    const startX = -((totalCards - 1) * spacing) / 2;

    for (let i = 0; i < totalCards; i += 1) {
      const face = previews?.[i]?.face ?? null;
      const cardImage = this.createPreviewCardImage(face, activeFace);
      cardImage.setPosition(startX + spacing * i, 0);
      container.add(cardImage);
    }

    return container;
  }

  private createPreviewCardImage(face: CardFace | null, activeFace: Face): Phaser.GameObjects.Image {
    const targetHeight = 96;
    const targetWidth = 64;

    if (face) {
      const frame = cardFrameFor(face, this.variant);
      if (frame) {
        const image = this.add.image(0, 0, frame.textureKey, frame.frame);
        image.setDisplaySize(targetWidth, targetHeight);
        image.setOrigin(0.5, 0.5);
        return image;
      }
      const fallback = this.fallbackTextureKey(face);
      const image = this.add.image(0, 0, fallback);
      image.setDisplaySize(targetWidth, targetHeight);
      image.setOrigin(0.5, 0.5);
      return image;
    }

    const backFrame = deckBackFrame(activeFace, this.variant);
    if (backFrame) {
      const image = this.add.image(0, 0, backFrame.textureKey, backFrame.frame);
      image.setDisplaySize(targetWidth, targetHeight);
      image.setOrigin(0.5, 0.5);
      return image;
    }

    const fallback = this.add.image(0, 0, activeFace === "dark" ? "card-dark" : "card-ruby");
    fallback.setDisplaySize(targetWidth, targetHeight);
    fallback.setOrigin(0.5, 0.5);
    return fallback;
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
    if (!this.state) {
      return;
    }
    this.actionPanel.innerHTML = "";

    const unoButton = document.createElement("button");
    unoButton.id = "uno-btn";
    unoButton.textContent = "UNO";

    const hasOneCard = this.hand.length === 1;
    if (!hasOneCard) {
      unoButton.disabled = true;
      unoButton.title = "UNO available when you have exactly one card";
    }
    if (!this.state.ruleSet.unoCall.required) {
      unoButton.disabled = true;
      unoButton.title = "UNO not required with current rules";
    } else if (this.state.ruleSet.unoCall.auto) {
      unoButton.disabled = true;
      unoButton.title = "UNO auto-call enabled";
    }

    unoButton.addEventListener("click", () => {
      if (unoButton.disabled) {
        return;
      }
      this.network.send({ type: "callUno" }).catch((err) => this.toast(err.message ?? "UNO failed"));
    });

    this.actionPanel.appendChild(unoButton);

    const catchTarget = this.findCatchTarget();
    if (catchTarget) {
      const catchButton = document.createElement("button");
      catchButton.id = "catch-btn";
      catchButton.textContent = `Catch ${catchTarget.name}`;
      catchButton.title = `${catchTarget.name} forgot to call UNO`;
      catchButton.addEventListener("click", () => {
        this.network.send({ type: "catchUno" }).catch((err) => this.toast(err.message ?? "Catch failed"));
      });
      this.actionPanel.appendChild(catchButton);
    }
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

  private findCatchTarget(): SerializableState["players"][number] | null {
    if (!this.state) {
      return null;
    }
    if (!this.state.ruleSet.unoCall.required) {
      return null;
    }
    const activeIndices = this.state.players
      .map((player, index) => (player.isSpectator ? -1 : index))
      .filter((index) => index !== -1);
    if (activeIndices.length <= 1) {
      return null;
    }
    const currentIndex = this.state.currentPlayerIndex;
    const currentPosition = activeIndices.indexOf(currentIndex);
    if (currentPosition === -1) {
      return null;
    }
    const len = activeIndices.length;
    const delta = this.state.direction === 1 ? -1 : 1;
    const previousIndex = activeIndices[((currentPosition + delta) % len + len) % len];
    const candidate = this.state.players[previousIndex];
    if (!candidate || candidate.id === this.playerId) {
      return null;
    }
    if (candidate.cardCount !== 1 || candidate.unoDeclared) {
      return null;
    }
    return candidate;
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
