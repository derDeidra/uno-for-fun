import {
  ActionType,
  CardFace,
  CardInstance,
  DualCard,
  Face,
  LightColor,
  DarkColor,
  Value,
  Color,
} from "./types";
import { SeedState } from "./types";
import { shuffleInPlace } from "./rng";

const lightColors: LightColor[] = ["Ruby", "Azure", "Emerald", "Sunshine"];
const darkColors: DarkColor[] = ["Amethyst", "Cerulean", "Saffron", "Obsidian"];
const numberValues: Value[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

let cardCounter = 0;

function nextCardId(prefix: string): string {
  cardCounter += 1;
  return `${prefix}-${cardCounter}`;
}

function createFace(
  face: Face,
  params: Omit<CardFace, "face" | "id">
): CardFace {
  return {
    id: nextCardId(`${face}-${params.kind}`),
    face,
    ...params,
  };
}

function createDualCard(light: CardFace, dark?: CardFace): DualCard {
  const dual: DualCard = {
    id: nextCardId("card"),
    light,
    dark: dark
      ? dark
      : {
          ...light,
          id: nextCardId("dark-clone"),
          face: "dark",
        },
  };
  return dual;
}

function cloneFace(face: CardFace, targetFace: Face): CardFace {
  return {
    ...face,
    face: targetFace,
    id: nextCardId(`${targetFace}-${face.kind}`),
  };
}

function baseLightFace(color: LightColor, value: Value): CardFace {
  return createFace("light", {
    kind: "number",
    color,
    value,
  });
}

function baseActionFace(
  color: LightColor,
  action: ActionType,
  drawCount?: number
): CardFace {
  return createFace("light", {
    kind: drawCount ? "wild" : "action",
    color,
    action,
    drawCount,
  });
}

function baseWildFace(action?: ActionType, drawCount?: number): CardFace {
  return createFace("light", {
    kind: "wild",
    color: "Wild",
    action,
    drawCount,
    wildPlayableColors: [...lightColors],
  });
}

function darkNumberFace(color: DarkColor, value: Value): CardFace {
  return createFace("dark", {
    kind: "number",
    color,
    value,
  });
}

function darkActionFace(
  color: DarkColor,
  action: ActionType,
  options: Partial<Pick<CardFace, "drawCount" | "skipCount" | "wildPlayableColors">> = {}
): CardFace {
  return createFace("dark", {
    kind: options.drawCount ? "wild" : "action",
    color,
    action,
    ...options,
  });
}

function darkWildFace(
  action: ActionType,
  drawCount: number,
  wildPlayableColors: Color[]
): CardFace {
  return createFace("dark", {
    kind: "wild",
    color: "Wild",
    action,
    drawCount,
    wildPlayableColors,
  });
}

export function createBaseDeck(): DualCard[] {
  const deck: DualCard[] = [];

  for (const color of lightColors) {
    const zeroLight = baseLightFace(color, 0);
    deck.push(createDualCard(zeroLight, cloneFace(zeroLight, "dark")));

    for (const value of numberValues.slice(1)) {
      const faceLight = baseLightFace(color, value);
      const faceDark = cloneFace(faceLight, "dark");
      deck.push(createDualCard(faceLight, faceDark));
      deck.push(createDualCard(baseLightFace(color, value), cloneFace(faceLight, "dark")));
    }

    const actions: Array<{ action: ActionType; drawCount?: number }> = [
      { action: "Skip" },
      { action: "Reverse" },
      { action: "DrawTwo", drawCount: 2 },
    ];

    for (const { action, drawCount } of actions) {
      const faceLight = baseActionFace(color, action, drawCount);
      const faceDark = cloneFace(faceLight, "dark");
      deck.push(createDualCard(faceLight, faceDark));
      deck.push(createDualCard(baseActionFace(color, action, drawCount), cloneFace(faceLight, "dark")));
    }
  }

  for (let i = 0; i < 4; i += 1) {
    const wild = baseWildFace();
    const wildDraw = baseWildFace("WildDrawFour", 4);
    deck.push(createDualCard(wild, cloneFace(wild, "dark")));
    deck.push(createDualCard(wildDraw, cloneFace(wildDraw, "dark")));
  }

  return deck;
}

export function createUnoFlipDeck(): DualCard[] {
  const deck: DualCard[] = [];

  const darkColorMap: Record<LightColor, DarkColor> = {
    Ruby: "Amethyst",
    Azure: "Cerulean",
    Emerald: "Saffron",
    Sunshine: "Obsidian",
  };

  for (const lightColor of lightColors) {
    const darkColor = darkColorMap[lightColor];

    deck.push(createDualCard(baseLightFace(lightColor, 0), darkNumberFace(darkColor, 0)));

    for (const value of numberValues.slice(1)) {
      const light = baseLightFace(lightColor, value);
      const dark = darkNumberFace(darkColor, value);
      deck.push(createDualCard(light, dark));
      deck.push(createDualCard(baseLightFace(lightColor, value), darkNumberFace(darkColor, value)));
    }

    const actionPairs: Array<{
      light: { action: ActionType; drawCount?: number };
      dark: { action: ActionType; drawCount?: number; skipCount?: number };
    }> = [
      {
        light: { action: "Skip" },
        dark: { action: "SkipAll", skipCount: 3 },
      },
      {
        light: { action: "Reverse" },
        dark: { action: "Reverse" },
      },
      {
        light: { action: "DrawTwo", drawCount: 2 },
        dark: { action: "DrawFive", drawCount: 5 },
      },
      {
        light: { action: "Flip" },
        dark: { action: "Flip" },
      },
    ];

    for (const pair of actionPairs) {
      const lightFace = createFace("light", {
        kind: pair.light.drawCount ? "wild" : "action",
        color: lightColor,
        action: pair.light.action,
        drawCount: pair.light.drawCount,
      });
      const darkFace = createFace("dark", {
        kind: pair.dark.drawCount ? "wild" : "action",
        color: darkColor,
        action: pair.dark.action,
        drawCount: pair.dark.drawCount,
        skipCount: pair.dark.skipCount,
      });

      deck.push(createDualCard(lightFace, darkFace));
      const lightCopy = createFace("light", {
        kind: pair.light.drawCount ? "wild" : "action",
        color: lightColor,
        action: pair.light.action,
        drawCount: pair.light.drawCount,
      });
      const darkCopy = createFace("dark", {
        kind: pair.dark.drawCount ? "wild" : "action",
        color: darkColor,
        action: pair.dark.action,
        drawCount: pair.dark.drawCount,
        skipCount: pair.dark.skipCount,
      });
      deck.push(createDualCard(lightCopy, darkCopy));
    }
  }

  for (let i = 0; i < 4; i += 1) {
    const lightWild = baseWildFace();
    const lightWildDraw = baseWildFace("WildDrawFour", 4);
    const darkFlipWild = createFace("dark", {
      kind: "wild",
      color: "Wild",
      action: "Flip",
      wildPlayableColors: [...darkColors],
    });
    const darkWildDraw = darkWildFace("WildDrawFive", 5, [...darkColors]);
    deck.push(createDualCard(lightWild, darkFlipWild));
    deck.push(createDualCard(lightWildDraw, darkWildDraw));
  }

  return deck;
}

export function instantiateDeck(deck: DualCard[], rng: SeedState): CardInstance[] {
  const instances: CardInstance[] = deck.map((card) => ({
    ...card,
  }));
  shuffleInPlace(instances, rng);
  return instances;
}

export function cloneCard(card: DualCard): DualCard {
  return {
    id: card.id,
    light: { ...card.light },
    dark: { ...card.dark },
  };
}

export function getCardFaceByActive(card: CardInstance, active: Face): CardFace {
  return active === "light" ? card.light : card.dark;
}

export function cardMatches(card: CardInstance, other: CardInstance, face: Face): boolean {
  const f1 = getCardFaceByActive(card, face);
  const f2 = getCardFaceByActive(other, face);
  if (f1.kind === "wild" || f2.kind === "wild") {
    if (f1.action && f2.action) {
      return f1.action === f2.action;
    }
    return true;
  }
  if (f1.kind === "number" && f2.kind === "number") {
    return f1.value === f2.value && f1.color === f2.color;
  }
  return f1.color === f2.color && f1.action === f2.action;
}
