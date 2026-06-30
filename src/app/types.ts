export type Screen = "import" | "solve";
export type AttemptState = "active" | "solved" | "failed" | "skipped";

export type BootstrapState = {
  productName: string;
  appVersion: string;
  appDataDir: string;
};

export type Puzzle = {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  openingTags: string[];
};

export type FeaturedPuzzleResponse = {
  datasetPath: string;
  puzzle: Puzzle;
};

export type SessionGameOption = {
  id: string;
  label: string;
  count: number;
};

export type SessionGameCategory = {
  id: string;
  label: string;
  count: number;
  openings: SessionGameOption[];
};

export type SessionThemeOption = {
  id: string;
  label: string;
  count: number;
};

export type SessionFilterOptions = {
  games: SessionGameCategory[];
  themes: SessionThemeOption[];
  minRating: number;
  maxRating: number;
};

export type LastMove = {
  from: string;
  to: string;
};

export type MoveFeedback = "success" | "failure" | null;

export type SessionStats = {
  solved: number;
  failed: number;
  skipped: number;
};

export type SessionSetup = {
  minRating: number;
  maxRating: number;
  game: string;
  themes: string[];
};

export type ScreenConfig = {
  id: Screen;
  title: string;
  copy: string;
};
