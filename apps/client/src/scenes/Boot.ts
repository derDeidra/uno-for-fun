import Phaser from "phaser";
import { NetworkClient } from "../ui/net";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "Boot" });
  }

  preload(): void {
    this.createCardTexture("card-ruby", 0xef3f5a, 0xffffff);
    this.createCardTexture("card-azure", 0x3fa9ef, 0xffffff);
    this.createCardTexture("card-emerald", 0x3fef92, 0x1b3f2f);
    this.createCardTexture("card-sunshine", 0xf2d94c, 0x1f1f1f);
    this.createCardTexture("card-dark", 0x1f1f1f, 0xf2d94c);
  }

  async create(): Promise<void> {
    const network = new NetworkClient();
    await network.connect();
    this.registry.set("network", network);
    this.scene.start("Lobby");
  }

  private createCardTexture(key: string, fill: number, stroke: number): void {
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
