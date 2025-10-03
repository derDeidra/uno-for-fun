import { Color, Face, WildColor } from "@game/engine";

const lightMap: Record<string, string> = {
  Ruby: "card-ruby",
  Azure: "card-azure",
  Emerald: "card-emerald",
  Sunshine: "card-sunshine",
};

const darkMap: Record<string, string> = {
  Amethyst: "card-dark",
  Cerulean: "card-dark",
  Saffron: "card-dark",
  Obsidian: "card-dark",
};

export function textureFor(color: Color | WildColor, face: Face): string {
  if (color === "Wild") {
    return face === "light" ? "card-sunshine" : "card-dark";
  }
  if (face === "light") {
    return lightMap[color] ?? "card-ruby";
  }
  return darkMap[color] ?? "card-dark";
}
