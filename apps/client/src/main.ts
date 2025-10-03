import Phaser from "phaser";
import BootScene from "./scenes/Boot";
import LobbyScene from "./scenes/Lobby";
import RoomScene from "./scenes/Room";
import GameScene from "./scenes/Game";
import ResultsScene from "./scenes/Results";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-root",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#1d1b2f",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, LobbyScene, RoomScene, GameScene, ResultsScene],
  physics: {
    default: "arcade",
  },
};

window.addEventListener("load", () => {
  const container = document.createElement("div");
  container.id = "game-root";
  document.body.appendChild(container);
  new Phaser.Game(config);
});
