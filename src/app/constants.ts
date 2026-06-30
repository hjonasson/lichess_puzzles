import { featureFlags } from "../feature_flags";
import type { Strings } from "../i18n";
import type {
  BootstrapState,
  Puzzle,
  ScreenConfig,
  SessionGameCategory,
  SessionThemeOption,
  SessionSetup,
} from "./types";

export const samplePuzzle: Puzzle = {
  id: "00sHx",
  fen: "q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17",
  moves: ["e8d7", "a2e6", "d7d8", "f7f8"],
  rating: 1760,
  themes: ["mate", "mateIn2", "middlegame", "short"],
  openingTags: ["Italian_Game", "Italian_Game_Classical_Variation"],
};

function formatOpeningLabel(opening: string) {
  return opening.replaceAll("_", " ");
}

export function getDefaultBootstrapState(strings: Strings): BootstrapState {
  return {
    productName: strings.app.kicker,
    appVersion: "0.1.0",
    appDataDir: strings.app.loadingAppDataPath,
  };
}

export function getAllScreens(strings: Strings): ScreenConfig[] {
  return [
    {
      id: "import",
      title: strings.screens.import.title,
      copy: strings.screens.import.copy,
    },
    {
      id: "solve",
      title: strings.screens.solve.title,
      copy: strings.screens.solve.copy,
    },
  ];
}

export const screenIds = featureFlags.libraryRoute
  ? (["import", "solve"] as const)
  : (["solve"] as const);

export const screenShortcuts = screenIds.map((screen, index) => ({
  key: String(index + 1),
  screen,
}));

export const screenShortcutHint =
  screenShortcuts.length > 1
    ? `${screenShortcuts[0].key}-${screenShortcuts[screenShortcuts.length - 1].key}`
    : (screenShortcuts[0]?.key ?? "");

export function getDefaultSessionSetup(): SessionSetup {
  return {
    minRating: 400,
    maxRating: 3200,
    game: "",
    themes: [],
  };
}

export const sessionOptionGames: SessionGameCategory[] = [
  {
    id: "French_Defense",
    label: formatOpeningLabel("French_Defense"),
    count: 1,
    openings: [
      {
        id: "French_Defense",
        label: formatOpeningLabel("French_Defense"),
        count: 1,
      },
    ],
  },
  {
    id: "Italian_Game",
    label: formatOpeningLabel("Italian_Game"),
    count: 1,
    openings: [
      {
        id: "Italian_Game",
        label: formatOpeningLabel("Italian_Game"),
        count: 1,
      },
    ],
  },
  {
    id: "Queens_Gambit",
    label: formatOpeningLabel("Queens_Gambit"),
    count: 1,
    openings: [
      {
        id: "Queens_Gambit",
        label: formatOpeningLabel("Queens_Gambit"),
        count: 1,
      },
    ],
  },
  {
    id: "Sicilian_Defense",
    label: formatOpeningLabel("Sicilian_Defense"),
    count: 1,
    openings: [
      {
        id: "Sicilian_Defense",
        label: formatOpeningLabel("Sicilian_Defense"),
        count: 1,
      },
    ],
  },
];

export const sessionOptionThemes: SessionThemeOption[] = [
  { id: "mate", label: "mate", count: 1 },
  { id: "middlegame", label: "middlegame", count: 1 },
  { id: "fork", label: "fork", count: 1 },
  { id: "pin", label: "pin", count: 1 },
  { id: "endgame", label: "endgame", count: 1 },
  { id: "sacrifice", label: "sacrifice", count: 1 },
];
