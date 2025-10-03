import Phaser from "phaser";

export default class ResultsScene extends Phaser.Scene {
  constructor() {
    super({ key: "Results" });
  }

  create(): void {
    const winners = (this.registry.get("winners") as string[]) ?? [];
    const text = winners.length ? `Winner(s): ${winners.join(", ")}` : "Game over";
    this.add.text(this.scale.width / 2, this.scale.height / 2, text, {
      fontSize: "28px",
      color: "#ffffff",
    }).setOrigin(0.5);

    const button = this.add.text(this.scale.width / 2, this.scale.height / 2 + 80, "Back to Lobby", {
      fontSize: "18px",
      color: "#ffdd57",
      backgroundColor: "#1f1f1f",
      padding: { x: 16, y: 10 },
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    button.on("pointerdown", () => {
      this.scene.stop("Game");
      this.scene.start("Lobby");
    });
  }
}
