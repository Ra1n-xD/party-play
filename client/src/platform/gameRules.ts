export type GameRulesAccent = "amber" | "green" | "blue";

export interface GameRulesFact {
  label: string;
  value: string;
}

export interface GameRulesSection {
  title: string;
  description?: string;
  items: string[];
}

export interface GameRules {
  accent: GameRulesAccent;
  tagline: string;
  summary: string;
  facts: GameRulesFact[];
  sections: GameRulesSection[];
  tips: string[];
}
