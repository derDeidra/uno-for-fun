import { z } from "zod";
import { RuleSet, SerializableState, CardInstance, Color } from "@game/engine";

const lightColors = ["Ruby", "Azure", "Emerald", "Sunshine"] as const;
const darkColors = ["Amethyst", "Cerulean", "Saffron", "Obsidian"] as const;

const colorSchema = z.enum([...lightColors, ...darkColors]);

export const ruleSetSchema: z.ZodType<RuleSet> = z.object({
  stacking: z.enum(["off", "sameTypeOnly", "anyDrawStacks"]),
  forcePlay: z.boolean(),
  drawToPlay: z.enum(["untilPlayable", "oneThenPass"]),
  jumpIn: z.object({
    enabled: z.boolean(),
    allowOnWildResolution: z.boolean(),
  }),
  sevenZero: z.boolean(),
  unoCall: z.object({
    required: z.boolean(),
    auto: z.boolean(),
    penaltyDraw: z.number().int().min(0),
  }),
  variant: z.enum(["base", "unoFlip"]),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("createRoom"),
    preferredCode: z.string().max(8).optional(),
    rules: ruleSetSchema.optional(),
  }),
  z.object({
    type: z.literal("joinRoom"),
    roomCode: z.string().max(8),
    name: z.string().min(1).max(40),
    spectator: z.boolean().optional(),
    token: z.string().optional(),
  }),
  z.object({ type: z.literal("leaveRoom") }),
  z.object({ type: z.literal("startGame") }),
  z.object({
    type: z.literal("playCard"),
    cardId: z.string(),
    chosenColor: colorSchema.optional(),
    targetPlayerId: z.string().optional(),
  }),
  z.object({ type: z.literal("drawCard") }),
  z.object({ type: z.literal("pass") }),
  z.object({ type: z.literal("callUno") }),
  z.object({
    type: z.literal("catchUno"),
    targetPlayerId: z.string().optional(),
  }),
  z.object({
    type: z.literal("jumpIn"),
    cardId: z.string(),
    chosenColor: colorSchema.optional(),
  }),
  z.object({ type: z.literal("finalizeJump") }),
  z.object({
    type: z.literal("setRules"),
    rules: ruleSetSchema,
  }),
  z.object({
    type: z.literal("chat"),
    message: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal("emote"),
    emoji: z.string().min(1).max(4),
  }),
]);

export const serverStateSchema: z.ZodType<SerializableState> = z.any();

export const serverHandSchema: z.ZodType<CardInstance[]> = z.any();

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("roomCreated"),
    roomCode: z.string().max(8),
    token: z.string(),
  }),
  z.object({
    type: z.literal("joined"),
    playerId: z.string(),
    token: z.string(),
  }),
  z.object({
    type: z.literal("state"),
    state: serverStateSchema,
    hand: serverHandSchema.optional(),
  }),
  z.object({
    type: z.literal("chat"),
    playerId: z.string(),
    message: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("emote"),
    playerId: z.string(),
    emoji: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
]);

export type ClientMessageInput = z.infer<typeof clientMessageSchema>;
export type ServerMessageOutput = z.infer<typeof serverMessageSchema>;
export type ColorInput = z.infer<typeof colorSchema>;
