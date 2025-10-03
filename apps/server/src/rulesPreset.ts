import { RuleSet } from "@game/engine";

export const defaultRuleSet: RuleSet = {
  stacking: "sameTypeOnly",
  forcePlay: false,
  drawToPlay: "oneThenPass",
  jumpIn: { enabled: true, allowOnWildResolution: false },
  sevenZero: true,
  unoCall: { required: true, auto: false, penaltyDraw: 2 },
  variant: "base",
};
