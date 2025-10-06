import Phaser from "phaser";
import { NetworkClient } from "../ui/net";
import { CARD_IMAGE_SOURCES, initializeCardTextures } from "../ui/assets";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "Boot" });
  }

  preload(): void {
    this.load.image("cards-light", CARD_IMAGE_SOURCES.light);
    this.load.image("cards-dark", CARD_IMAGE_SOURCES.dark);
  }

  async create(): Promise<void> {
    initializeCardTextures(this);
    this.createFallbackTexture("card-ruby", 0xef3f5a, 0xffffff);
    this.createFallbackTexture("card-azure", 0x3fa9ef, 0xffffff);
    this.createFallbackTexture("card-emerald", 0x3fef92, 0x1b3f2f);
    this.createFallbackTexture("card-sunshine", 0xf2d94c, 0x1f1f1f);
    this.createFallbackTexture("card-dark", 0x1f1f1f, 0xf2d94c);

    const network = new NetworkClient();
    await network.connect();
    if (typeof window !== "undefined" && import.meta.env.DEV) {
      (window as any).__unoNetwork = network;
    }
    this.registry.set("network", network);
    this.scene.start("Lobby");
  }

  private createFallbackTexture(key: string, fill: number, stroke: number): void {
    if (this.textures.exists(key)) {
      return;
    }
    const size = 128;
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(fill, 1);
    graphics.fillRoundedRect(0, 0, size, size * 1.4, 16);
    graphics.lineStyle(6, stroke, 1);
    graphics.strokeRoundedRect(0, 0, size, size * 1.4, 16);
    graphics.generateTexture(key, size, size * 1.4);
    graphics.destroy();
  }
}
