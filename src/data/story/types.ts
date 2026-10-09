/** Colours and accessories for a procedurally drawn character portrait. */
export interface PortraitSpec {
  skin: number;
  hair: number;
  hat: number | null;
  glasses: boolean;
  scarf: number;
}

export interface CastMember {
  name: string;
  /** What they say when they climb aboard. */
  line: string;
  portrait: PortraitSpec;
}

export interface LevelStory {
  headline: string;
  /** Short tag shown on the briefing card ("Airport transfer"). */
  stamp: string;
  /** Paragraphs of the briefing. */
  text: string[];
  /** Keys into `cast`. */
  passengers: string[];
  /** What the player actually has to do (mission mechanics in plain words). */
  objectives: string[];
  watchOut: string[];
}

export interface StoryBook {
  cast: Record<string, CastMember>;
  levels: Record<string, LevelStory>;
}
