import type { CardFace, DarkColor, Face, LightColor, RuleSet } from "@game/engine";
import type Phaser from "phaser";
import atlasData from "../assets/uno_texture_atlas.json";
import classicNamedMap from "../assets/uno_classic_named_map.json";
import flipNamedMap from "../assets/uno_flip_named_map.json";
import cardLightUrl from "../assets/uno_flip_light.png?url";
import cardDarkUrl from "../assets/uno_flip_dark.png?url";

const CLASSIC_TEXTURE_KEY = "cards-light" as const;
const FLIP_TEXTURE_KEY = "cards-dark" as const;

const atlas = atlasData as {
  classic: {
    image: string;
    image_size: { w: number; h: number };
    tiles: Record<string, { x: number; y: number; w: number; h: number }>;
  };
  flip: {
    image: string;
    image_size: { w: number; h: number };
    tiles: Record<string, { x: number; y: number; w: number; h: number }>;
  };
};

type ClassicColorName = "red" | "blue" | "green" | "yellow";
type FlipColorName = "orange" | "magenta" | "purple" | "teal";

type NamedMap = Record<string, string>;

const classicMap = classicNamedMap as NamedMap;
const flipMap = flipNamedMap as NamedMap;

const LIGHT_COLOR_TO_CLASSIC: Record<LightColor, ClassicColorName> = {
  Ruby: "red",
  Azure: "blue",
  Emerald: "green",
  Sunshine: "yellow",
};

const DARK_COLOR_TO_FLIP: Record<DarkColor, FlipColorName> = {
  Amethyst: "purple",
  Cerulean: "teal",
  Saffron: "orange",
  Obsidian: "magenta",
};

type Variant = RuleSet["variant"];

type AtlasKey = keyof typeof atlas;

interface TextureRegion {
  textureKey: typeof CLASSIC_TEXTURE_KEY | typeof FLIP_TEXTURE_KEY;
  frame: string;
  atlas: AtlasKey;
  imageUrl: string;
  imageSize: { w: number; h: number };
  rect: { x: number; y: number; w: number; h: number };
}

function resolveClassicName(face: CardFace): string | null {
  if (face.kind === "number" && typeof face.value === "number") {
    const color = LIGHT_COLOR_TO_CLASSIC[face.color as LightColor];
    return color ? `${color}_${face.value}` : null;
  }

  if (face.kind === "action") {
    const color = LIGHT_COLOR_TO_CLASSIC[face.color as LightColor];
    if (!color || !face.action) {
      return null;
    }
    switch (face.action) {
      case "Skip":
        return `${color}_skip`;
      case "Reverse":
        return `${color}_reverse`;
      case "DrawTwo":
        return `${color}_draw2`;
      default:
        return null;
    }
  }

  if (face.kind === "wild") {
    switch (face.action) {
      case undefined:
        return "wild";
      case "WildDrawFour":
        return "draw4";
      default:
        return "wild_blank";
    }
  }

  return null;
}

function resolveFlipName(face: CardFace): string | null {
  if (face.kind === "number" && typeof face.value === "number") {
    const color = DARK_COLOR_TO_FLIP[face.color as DarkColor];
    return color ? `${color}_${face.value}` : null;
  }

  if (face.kind === "action" && face.action) {
    const color = DARK_COLOR_TO_FLIP[face.color as DarkColor];
    if (!color) {
      return null;
    }
    switch (face.action) {
      case "Skip":
      case "SkipAll":
        return `${color}_skip`;
      case "Reverse":
        return flipMap[`${color}_reverse`] ? `${color}_reverse` : `${color}_reverse_alt`;
      case "DrawFive":
        return `${color}_draw5`;
      case "Flip":
        return `${color}_flip`;
      default:
        return null;
    }
  }

  if (face.kind === "wild") {
    switch (face.action) {
      case undefined:
        return "wild_blank";
      case "Flip":
        return "wild_multi_white";
      case "WildDrawFive":
        return "wild_stack_white";
      default:
        return "wild_blank";
    }
  }

  return null;
}

function resolveTileId(face: CardFace, variant: Variant): { atlas: AtlasKey; tileId: string } | null {
  const atlasKey: AtlasKey = face.face === "dark" && variant === "unoFlip" ? "flip" : "classic";
  const map = atlasKey === "classic" ? classicMap : flipMap;
  const resolver = atlasKey === "classic" ? resolveClassicName : resolveFlipName;
  const name = resolver(face);
  if (!name) {
    console.warn("[assets] Missing named mapping for face", face);
    return null;
  }
  const tileId = map[name];
  if (!tileId) {
    console.warn(`[assets] No tile id for name "${name}"`, face);
    return null;
  }
  return { atlas: atlasKey, tileId };
}

function tileToRegion(atlasKey: AtlasKey, tileId: string): TextureRegion | null {
  const section = atlas[atlasKey];
  const tile = section.tiles[tileId];
  if (!tile) {
    console.warn(`[assets] Tile "${tileId}" not found in atlas ${atlasKey}`);
    return null;
  }
  const textureKey = atlasKey === "classic" ? CLASSIC_TEXTURE_KEY : FLIP_TEXTURE_KEY;
  const imageUrl = atlasKey === "classic" ? cardLightUrl : cardDarkUrl;
  return {
    textureKey,
    frame: tileId,
    atlas: atlasKey,
    imageUrl,
    imageSize: section.image_size,
    rect: tile,
  };
}

export function cardFrameFor(face: CardFace, variant: Variant): TextureRegion | null {
  const info = resolveTileId(face, variant);
  if (!info) {
    return null;
  }
  return tileToRegion(info.atlas, info.tileId);
}

export function deckBackFrame(face: Face, variant: Variant): TextureRegion | null {
  if (face === "dark" && variant === "unoFlip") {
    const tileId = flipMap["flip_symbol_purple"];
    return tileId ? tileToRegion("flip", tileId) : null;
  }
  const tileId = classicMap["back"];
  return tileId ? tileToRegion("classic", tileId) : null;
}

export function initializeCardTextures(scene: Phaser.Scene): void {
  const manager = scene.textures;
  const classicTexture = manager.get(CLASSIC_TEXTURE_KEY);
  const flipTexture = manager.get(FLIP_TEXTURE_KEY);

  if (!classicTexture) {
    console.warn(`[assets] Texture "${CLASSIC_TEXTURE_KEY}" not loaded`);
  } else {
    for (const [frameKey, frame] of Object.entries(atlas.classic.tiles)) {
      if (!classicTexture.has(frameKey)) {
        classicTexture.add(frameKey, 0, frame.x, frame.y, frame.w, frame.h);
      }
    }
  }

  if (!flipTexture) {
    console.warn(`[assets] Texture "${FLIP_TEXTURE_KEY}" not loaded`);
  } else {
    for (const [frameKey, frame] of Object.entries(atlas.flip.tiles)) {
      if (!flipTexture.has(frameKey)) {
        flipTexture.add(frameKey, 0, frame.x, frame.y, frame.w, frame.h);
      }
    }
  }
}

export const CARD_IMAGE_SOURCES = {
  light: cardLightUrl,
  dark: cardDarkUrl,
} as const;

export const CARD_TEXTURE_DIMENSIONS = {
  light: atlas.classic.image_size,
  dark: atlas.flip.image_size,
} as const;

