import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Chess, type Square } from "chess.js";
import type { PieceDropHandlerArgs } from "react-chessboard";
import styles from "./App.module.css";
import { featureFlags } from "./feature_flags";
import { useI18n, type MessageState } from "./i18n";
import {
  getAllScreens,
  getDefaultBootstrapState,
  getDefaultSessionSetup,
  screenShortcuts,
  samplePuzzle,
  sessionOptionGames as fallbackSessionOptionGames,
  sessionOptionThemes as fallbackSessionOptionThemes,
} from "./app/constants";
import {
  applyMoveSequence,
  buildSquareStyles,
  getLegalTargets,
  parseUciMove,
  squareFromArrow,
} from "./app/chess";
import { AppHeader } from "./app/components/AppHeader";
import { LibraryScreen } from "./app/components/LibraryScreen";
import { SessionSidebar } from "./app/components/SessionSidebar";
import { SolveScreen } from "./app/components/SolveScreen";
import { StepNav } from "./app/components/StepNav";
import type {
  AttemptState,
  BootstrapState,
  FeaturedPuzzleResponse,
  LastMove,
  MoveFeedback,
  Puzzle,
  Screen,
  SessionFilterOptions,
  SessionGameCategory,
  SessionSetup,
  SessionStats,
  SessionThemeOption,
} from "./app/types";

function clampSessionSetup(
  sessionSetup: SessionSetup,
  ratingBounds: { min: number; max: number },
  sessionOptionGames: SessionGameCategory[],
  sessionOptionThemes: SessionThemeOption[],
): SessionSetup {
  const minRating = Math.max(
    ratingBounds.min,
    Math.min(sessionSetup.minRating, ratingBounds.max),
  );
  const maxRating = Math.max(
    minRating,
    Math.min(sessionSetup.maxRating, ratingBounds.max),
  );
  const validGameIds = new Set(
    sessionOptionGames.flatMap((category) =>
      category.openings.map((opening) => opening.id),
    ),
  );
  const validThemeIds = new Set(sessionOptionThemes.map((theme) => theme.id));

  return {
    minRating,
    maxRating,
    game: validGameIds.has(sessionSetup.game) ? sessionSetup.game : "",
    themes: sessionSetup.themes.filter((theme) => validThemeIds.has(theme)),
  };
}

function summarizeSelectedThemes(
  themeIds: string[],
  sessionOptionThemes: SessionThemeOption[],
  emptyLabel: string,
) {
  if (themeIds.length === 0) {
    return emptyLabel;
  }

  const labels = themeIds.map(
    (themeId) =>
      sessionOptionThemes.find((option) => option.id === themeId)?.label ??
      themeId,
  );

  if (labels.length <= 2) {
    return labels.join(", ");
  }

  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

function isDefaultSessionSetup(sessionSetup: SessionSetup) {
  return (
    sessionSetup.minRating === 400 &&
    sessionSetup.maxRating === 3200 &&
    sessionSetup.game === "" &&
    sessionSetup.themes.length === 0
  );
}

function areSessionSetupsEqual(
  left: SessionSetup,
  right: SessionSetup,
): boolean {
  return (
    left.minRating === right.minRating &&
    left.maxRating === right.maxRating &&
    left.game === right.game &&
    left.themes.length === right.themes.length &&
    left.themes.every((theme, index) => theme === right.themes[index])
  );
}

function App() {
  const openingPreviewDelayMs = 500;
  const opponentReplyDelayMs = 280;
  const { locale, localeOptions, setLocale, strings } = useI18n();
  const defaultBootstrapState = useMemo(
    () => getDefaultBootstrapState(strings),
    [strings],
  );
  const defaultSessionSetup = useMemo(() => getDefaultSessionSetup(), []);
  const allScreens = useMemo(() => getAllScreens(strings), [strings]);
  const screens = useMemo(
    () =>
      allScreens.filter(
        (screen) => featureFlags.libraryRoute || screen.id !== "import",
      ),
    [allScreens],
  );
  const [screen, setScreen] = useState<Screen>(
    featureFlags.libraryRoute ? "import" : "solve",
  );
  const [bootstrapState, setBootstrapState] = useState(() =>
    getDefaultBootstrapState(strings),
  );
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle>(samplePuzzle);
  const [datasetPath, setDatasetPath] = useState(
    strings.status.usingBundledPreviewPuzzle,
  );
  const [position, setPosition] = useState(samplePuzzle.fen);
  const [plyIndex, setPlyIndex] = useState(0);
  const [attemptState, setAttemptState] = useState<AttemptState>("active");
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    solved: 0,
    failed: 0,
    skipped: 0,
  });
  const [sessionSetup, setSessionSetup] =
    useState<SessionSetup>(defaultSessionSetup);
  const [activeSessionSetup, setActiveSessionSetup] =
    useState<SessionSetup>(defaultSessionSetup);
  const [sessionOptionGames, setSessionOptionGames] = useState<
    SessionGameCategory[]
  >(fallbackSessionOptionGames);
  const [sessionOptionThemes, setSessionOptionThemes] = useState<
    SessionThemeOption[]
  >(fallbackSessionOptionThemes);
  const [ratingBounds, setRatingBounds] = useState({ min: 400, max: 3200 });
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [focusedSquare, setFocusedSquare] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [moveFeedback, setMoveFeedback] = useState<MoveFeedback>(null);
  const [puzzleCursor, setPuzzleCursor] = useState(0);
  const [message, setMessage] = useState<MessageState>({ key: "startPuzzle" });
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [hasLoadedInitialPuzzle, setHasLoadedInitialPuzzle] = useState(false);
  const [hasRequestedSessionFilters, setHasRequestedSessionFilters] =
    useState(false);
  const [sessionFiltersStatus, setSessionFiltersStatus] = useState<
    "idle" | "loading" | "loaded"
  >("idle");
  const autoPlayTimeoutIdsRef = useRef<number[]>([]);
  const usedFastStartupLoadRef = useRef(false);

  const clearAutoPlayTimeouts = () => {
    for (const timeoutId of autoPlayTimeoutIdsRef.current) {
      window.clearTimeout(timeoutId);
    }
    autoPlayTimeoutIdsRef.current = [];
  };

  const scheduleAutoPlay = (callback: () => void, delayMs: number) => {
    const timeoutId = window.setTimeout(() => {
      autoPlayTimeoutIdsRef.current = autoPlayTimeoutIdsRef.current.filter(
        (currentId) => currentId !== timeoutId,
      );
      callback();
    }, delayMs);

    autoPlayTimeoutIdsRef.current.push(timeoutId);
  };

  const boardOrientation = (() => {
    if (currentPuzzle.moves.length === 0) {
      return position.split(" ")[1] === "w" ? "white" : "black";
    }

    const chess = new Chess(currentPuzzle.fen);
    chess.move(parseUciMove(currentPuzzle.moves[0]));
    return chess.fen().split(" ")[1] === "w" ? "white" : "black";
  })();
  const activeSessionThemeSummary = summarizeSelectedThemes(
    activeSessionSetup.themes,
    sessionOptionThemes,
    strings.labels.allThemes,
  );
  const sessionGameLabel =
    sessionOptionGames
      .flatMap((category) => category.openings)
      .find((opening) => opening.id === activeSessionSetup.game)?.label ??
    activeSessionSetup.game;

  const updateSessionSetup = <Key extends keyof SessionSetup>(
    key: Key,
    value: SessionSetup[Key],
  ) => {
    setHasRequestedSessionFilters(true);
    setSessionSetup((current) => ({ ...current, [key]: value }));
  };

  const toggleTheme = (theme: string) => {
    setHasRequestedSessionFilters(true);
    setSessionSetup((current) => ({
      ...current,
      themes: current.themes.includes(theme)
        ? current.themes.filter((item) => item !== theme)
        : [...current.themes, theme],
    }));
  };

  useEffect(() => {
    let cancelled = false;

    const loadBootstrapState = async () => {
      try {
        const nextState = await invoke<BootstrapState>("bootstrap_state");
        if (!cancelled) {
          setBootstrapState(nextState);
        }
      } catch {
        if (!cancelled) {
          setBootstrapState({
            ...defaultBootstrapState,
            appDataDir: strings.status.browserPreviewFallback,
          });
        }
      }
    };

    void loadBootstrapState();

    return () => {
      cancelled = true;
    };
  }, [defaultBootstrapState, strings]);

  const loadSessionFilters = useEffectEvent(async () => {
    if (sessionFiltersStatus !== "idle") {
      return;
    }

    setSessionFiltersStatus("loading");

    try {
      const nextFilters = await invoke<SessionFilterOptions>(
        "load_session_filters",
      );

      if (nextFilters.games.length > 0) {
        setSessionOptionGames(nextFilters.games);
      }
      if (nextFilters.themes.length > 0) {
        setSessionOptionThemes(nextFilters.themes);
      }

      const nextRatingBounds = {
        min: nextFilters.minRating,
        max: nextFilters.maxRating,
      };
      setRatingBounds(nextRatingBounds);
      setSessionSetup((current) => {
        const nextSessionSetup = clampSessionSetup(
          current,
          nextRatingBounds,
          nextFilters.games.length > 0
            ? nextFilters.games
            : fallbackSessionOptionGames,
          nextFilters.themes.length > 0
            ? nextFilters.themes
            : fallbackSessionOptionThemes,
        );

        return areSessionSetupsEqual(current, nextSessionSetup)
          ? current
          : nextSessionSetup;
      });
      setActiveSessionSetup((current) => {
        const nextSessionSetup = clampSessionSetup(
          current,
          nextRatingBounds,
          nextFilters.games.length > 0
            ? nextFilters.games
            : fallbackSessionOptionGames,
          nextFilters.themes.length > 0
            ? nextFilters.themes
            : fallbackSessionOptionThemes,
        );

        return areSessionSetupsEqual(current, nextSessionSetup)
          ? current
          : nextSessionSetup;
      });
      setSessionFiltersStatus("loaded");
    } catch {
      setSessionOptionGames(fallbackSessionOptionGames);
      setSessionOptionThemes(fallbackSessionOptionThemes);
      setSessionFiltersStatus("idle");
    }
  });

  useEffect(() => {
    if (!hasLoadedInitialPuzzle) {
      return;
    }

    if (!isSidebarOpen && !hasRequestedSessionFilters) {
      return;
    }

    void loadSessionFilters();
  }, [hasLoadedInitialPuzzle, hasRequestedSessionFilters, isSidebarOpen]);

  useEffect(() => {
    return () => {
      clearAutoPlayTimeouts();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const buildActivePuzzleState = (puzzle: Puzzle) => {
      if (puzzle.moves.length === 0) {
        return {
          position: puzzle.fen,
          plyIndex: 0,
          focusedSquare: null,
          lastMove: null,
        };
      }

      const chess = new Chess(puzzle.fen);
      const openingMove = parseUciMove(puzzle.moves[0]);
      chess.move(openingMove);

      return {
        position: chess.fen(),
        plyIndex: 1,
        focusedSquare: openingMove.to,
        lastMove: { from: openingMove.from, to: openingMove.to },
      };
    };

    const resetLoadedPuzzle = (puzzle: Puzzle, path: string) => {
      clearAutoPlayTimeouts();
      const activePuzzleState = buildActivePuzzleState(puzzle);

      setCurrentPuzzle(puzzle);
      setDatasetPath(path);
      setAttemptState("active");
      setSelectedSquare(null);
      setMoveFeedback(null);
      setMessage({ key: "startPuzzle" });

      if (puzzle.moves.length === 0) {
        setPosition(activePuzzleState.position);
        setPlyIndex(activePuzzleState.plyIndex);
        setFocusedSquare(activePuzzleState.focusedSquare);
        setLastMove(activePuzzleState.lastMove);
        setIsAutoPlaying(false);
        return;
      }

      setPosition(puzzle.fen);
      setPlyIndex(0);
      setFocusedSquare(null);
      setLastMove(null);
      setIsAutoPlaying(true);

      scheduleAutoPlay(() => {
        setPosition(activePuzzleState.position);
        setPlyIndex(activePuzzleState.plyIndex);
        setFocusedSquare(activePuzzleState.focusedSquare);
        setLastMove(activePuzzleState.lastMove);
        setIsAutoPlaying(false);
      }, openingPreviewDelayMs);
    };

    const loadFeaturedPuzzle = async () => {
      try {
        const shouldUseFastStartupLoad =
          !usedFastStartupLoadRef.current &&
          puzzleCursor === 0 &&
          isDefaultSessionSetup(activeSessionSetup);

        const response = shouldUseFastStartupLoad
          ? await invoke<FeaturedPuzzleResponse>("load_startup_puzzle")
          : await invoke<FeaturedPuzzleResponse>("load_featured_puzzle", {
              index: puzzleCursor,
              sessionSetup: activeSessionSetup,
            });

        if (shouldUseFastStartupLoad) {
          usedFastStartupLoadRef.current = true;
        }

        if (!cancelled) {
          resetLoadedPuzzle(response.puzzle, response.datasetPath);
          setHasLoadedInitialPuzzle(true);
        }
      } catch {
        if (!cancelled) {
          resetLoadedPuzzle(samplePuzzle, strings.status.datasetUnavailable);
          setHasLoadedInitialPuzzle(true);
        }
      }
    };

    void loadFeaturedPuzzle();

    return () => {
      cancelled = true;
    };
  }, [activeSessionSetup, puzzleCursor]);

  useEffect(() => {
    if (!moveFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => setMoveFeedback(null), 380);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [moveFeedback]);

  const resetPuzzle = () => {
    clearAutoPlayTimeouts();

    if (currentPuzzle.moves.length === 0) {
      setPosition(currentPuzzle.fen);
      setPlyIndex(0);
      setFocusedSquare(null);
      setLastMove(null);
      setIsAutoPlaying(false);
    } else {
      const chess = new Chess(currentPuzzle.fen);
      const openingMove = parseUciMove(currentPuzzle.moves[0]);
      chess.move(openingMove);

      setPosition(currentPuzzle.fen);
      setPlyIndex(0);
      setFocusedSquare(null);
      setLastMove(null);
      setIsAutoPlaying(true);

      scheduleAutoPlay(() => {
        setPosition(chess.fen());
        setPlyIndex(1);
        setFocusedSquare(openingMove.to);
        setLastMove({ from: openingMove.from, to: openingMove.to });
        setIsAutoPlaying(false);
      }, openingPreviewDelayMs);
    }

    setAttemptState("active");
    setSelectedSquare(null);
    setMoveFeedback(null);
    setMessage({ key: "startPuzzle" });
  };

  const loadNextPuzzle = () => {
    clearAutoPlayTimeouts();
    setPuzzleCursor((current) => current + 1);
    setScreen("solve");
  };

  const startNewSession = () => {
    clearAutoPlayTimeouts();
    setSessionStats({ solved: 0, failed: 0, skipped: 0 });
    setActiveSessionSetup(
      clampSessionSetup(
        sessionSetup,
        ratingBounds,
        sessionOptionGames,
        sessionOptionThemes,
      ),
    );
    setPuzzleCursor(0);
    setScreen("solve");
  };

  const skipPuzzle = () => {
    clearAutoPlayTimeouts();
    setAttemptState("skipped");
    setSessionStats((current) => ({
      ...current,
      skipped: current.skipped + 1,
    }));
    setSelectedSquare(null);
    setFocusedSquare(null);
    setMoveFeedback(null);
    setMessage({ key: "skipPuzzle" });
  };

  const activeChess = new Chess(position);

  const tryMove = (sourceSquare: string, targetSquare: string) => {
    if (screen !== "solve" || attemptState !== "active" || isAutoPlaying) {
      return false;
    }

    if (sourceSquare === targetSquare) {
      setSelectedSquare(null);
      setFocusedSquare(sourceSquare);
      return false;
    }

    const attemptedChess = new Chess(position);
    const attemptedLegalMove = attemptedChess.move({
      from: sourceSquare as Square,
      to: targetSquare as Square,
      promotion: "q",
    });

    if (!attemptedLegalMove) {
      setSelectedSquare(null);
      setFocusedSquare(sourceSquare);
      return false;
    }

    const expectedMove = currentPuzzle.moves[plyIndex];
    const attemptedMove = `${sourceSquare}${targetSquare}`;

    if (attemptedMove !== expectedMove) {
      setAttemptState("failed");
      setSessionStats((current) => ({
        ...current,
        failed: current.failed + 1,
      }));
      setSelectedSquare(null);
      setFocusedSquare(targetSquare);
      setMoveFeedback("failure");
      setMessage({
        key: "failedMove",
        values: {
          attemptedMove,
          expectedMove,
        },
      });
      return false;
    }

    const nextChess = new Chess(position);
    const resolvedMove = parseUciMove(expectedMove);
    nextChess.move(resolvedMove);

    let nextPlyIndex = plyIndex + 1;

    setPosition(nextChess.fen());
    setPlyIndex(nextPlyIndex);
    setSelectedSquare(null);
    setFocusedSquare(resolvedMove.to);
    setLastMove({ from: resolvedMove.from, to: resolvedMove.to });
    setMoveFeedback("success");

    if (nextPlyIndex >= currentPuzzle.moves.length) {
      setAttemptState("solved");
      setSessionStats((current) => ({
        ...current,
        solved: current.solved + 1,
      }));
      setMessage({ key: "solved" });
      return true;
    }

    setIsAutoPlaying(true);

    if (nextPlyIndex < currentPuzzle.moves.length) {
      const reply = currentPuzzle.moves[nextPlyIndex];
      const replyMove = parseUciMove(reply);

      scheduleAutoPlay(() => {
        const replyChess = new Chess(nextChess.fen());
        replyChess.move(replyMove);
        nextPlyIndex += 1;

        setPosition(replyChess.fen());
        setPlyIndex(nextPlyIndex);
        setFocusedSquare(replyMove.to);
        setLastMove({ from: replyMove.from, to: replyMove.to });
        setIsAutoPlaying(false);

        if (nextPlyIndex >= currentPuzzle.moves.length) {
          setAttemptState("solved");
          setSessionStats((current) => ({
            ...current,
            solved: current.solved + 1,
          }));
          setMessage({ key: "solved" });
        } else {
          setMessage({ key: "correctMove" });
        }
      }, opponentReplyDelayMs);
    }

    return true;
  };

  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
  }: PieceDropHandlerArgs) => {
    if (!sourceSquare || !targetSquare) {
      return false;
    }

    return tryMove(sourceSquare, targetSquare);
  };

  const handlePieceClick = ({ square }: { square: string | null }) => {
    if (
      screen !== "solve" ||
      attemptState !== "active" ||
      isAutoPlaying ||
      !square
    ) {
      return;
    }

    setFocusedSquare(square);

    if (
      selectedSquare &&
      selectedSquare !== square &&
      tryMove(selectedSquare, square)
    ) {
      return;
    }

    const piece = activeChess.get(square as Square);
    if (!piece || piece.color !== activeChess.turn()) {
      setSelectedSquare(null);
      return;
    }

    const nextSelection = selectedSquare === square ? null : square;
    setSelectedSquare(nextSelection);
  };

  const handleSquareClick = ({ square }: { square: string }) => {
    if (screen !== "solve" || attemptState !== "active" || isAutoPlaying) {
      return;
    }

    setFocusedSquare(square);

    if (!selectedSquare) {
      const piece = activeChess.get(square as Square);
      if (piece && piece.color === activeChess.turn()) {
        setSelectedSquare(square);
      }
      return;
    }

    if (square === selectedSquare) {
      setSelectedSquare(null);
      return;
    }

    void tryMove(selectedSquare, square);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (event.key) {
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight": {
          if (screen !== "solve" || isAutoPlaying) {
            return;
          }

          event.preventDefault();
          const nextFocusedSquare = squareFromArrow(
            focusedSquare ?? "d4",
            event.key,
            boardOrientation,
          );
          setFocusedSquare(nextFocusedSquare);
          break;
        }
        case "Enter":
        case " ":
          if (screen !== "solve" || isAutoPlaying || !focusedSquare) {
            return;
          }

          event.preventDefault();
          handleSquareClick({ square: focusedSquare });
          break;
        case "r":
        case "R":
          event.preventDefault();
          resetPuzzle();
          break;
        case "s":
        case "S":
          if (attemptState === "active") {
            event.preventDefault();
            skipPuzzle();
          }
          break;
        case "n":
        case "N":
          if (activeAttemptComplete) {
            event.preventDefault();
            loadNextPuzzle();
          }
          break;
        case "Escape":
          setSelectedSquare(null);
          break;
        default: {
          const shortcut =
            screenShortcuts.length > 1
              ? screenShortcuts.find((item) => item.key === event.key)
              : null;
          if (shortcut) {
            setScreen(shortcut.screen);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    attemptState,
    boardOrientation,
    focusedSquare,
    isAutoPlaying,
    screen,
    selectedSquare,
  ]);

  const previewChess = new Chess(currentPuzzle.fen);
  if (attemptState !== "active") {
    applyMoveSequence(previewChess, currentPuzzle.moves);
  }

  const remainingCount = attemptState === "active" ? 1 : 0;
  const boardPosition =
    attemptState === "active" ? position : previewChess.fen();
  const legalTargets = getLegalTargets(
    activeChess,
    selectedSquare,
    screen === "solve" && attemptState === "active",
  );
  const squareStyles = buildSquareStyles(
    selectedSquare,
    focusedSquare,
    legalTargets,
    lastMove,
  );
  const activeScreen =
    screens.find((item) => item.id === screen) ?? allScreens[0];
  const activeAttemptComplete = attemptState !== "active";
  const sessionAttemptCount =
    sessionStats.solved +
    sessionStats.failed +
    sessionStats.skipped +
    remainingCount;
  const sessionCompletion =
    sessionAttemptCount === 0
      ? 0
      : Math.round(
          ((sessionStats.solved + sessionStats.failed + sessionStats.skipped) /
            sessionAttemptCount) *
            100,
        );
  const resultLabel =
    attemptState === "solved"
      ? strings.status.solved
      : attemptState === "failed"
        ? strings.status.failed
        : attemptState === "skipped"
          ? strings.status.skipped
          : strings.status.inProgress;
  const resultTone =
    attemptState === "solved"
      ? styles.resultSolved
      : attemptState === "failed"
        ? styles.resultFailed
        : attemptState === "skipped"
          ? styles.resultSkipped
          : styles.resultActive;

  return (
    <div className={styles.appShell}>
      <AppHeader />

      {screens.length > 1 && (
        <StepNav screens={screens} screen={screen} onSelectScreen={setScreen} />
      )}

      <main
        className={`${styles.contentGrid} ${
          isSidebarOpen ? "" : styles.contentGridSidebarClosed
        }`}
      >
        {screen === "solve" ? (
          <SolveScreen
            currentPuzzle={currentPuzzle}
            boardPosition={boardPosition}
            boardOrientation={boardOrientation}
            isSidebarOpen={isSidebarOpen}
            interactionLocked={isAutoPlaying}
            attemptState={attemptState}
            moveFeedback={moveFeedback}
            squareStyles={squareStyles}
            resultLabel={resultLabel}
            resultToneClassName={resultTone}
            message={message}
            activeAttemptComplete={activeAttemptComplete}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            onResetPuzzle={resetPuzzle}
            onLoadNextPuzzle={loadNextPuzzle}
            onSkipPuzzle={skipPuzzle}
            onPieceClick={handlePieceClick}
            onSquareClick={handleSquareClick}
            onPieceDrop={handlePieceDrop}
          />
        ) : (
          <section className={`${styles.panel} ${styles.heroPanel}`}>
            <h2>{screen === "import" && strings.headings.library}</h2>

            {screen === "import" && (
              <LibraryScreen
                datasetPath={datasetPath}
                currentPuzzle={currentPuzzle}
                samplePuzzleId={samplePuzzle.id}
                onContinueToSession={() => setScreen("solve")}
              />
            )}
          </section>
        )}

        {isSidebarOpen && (
          <SessionSidebar
            sessionStats={sessionStats}
            remainingCount={remainingCount}
            sessionCompletion={sessionCompletion}
            currentPuzzle={currentPuzzle}
            sessionSetup={sessionSetup}
            activeSessionSetup={activeSessionSetup}
            activeScreenTitle={activeScreen.title}
            sessionGameLabel={sessionGameLabel}
            sessionThemeSummary={activeSessionThemeSummary}
            sessionOptionGames={sessionOptionGames}
            sessionOptionThemes={sessionOptionThemes}
            ratingBounds={ratingBounds}
            locale={locale}
            localeOptions={localeOptions}
            productName={bootstrapState.productName}
            appVersion={bootstrapState.appVersion}
            resultLabel={resultLabel}
            activeAttemptComplete={activeAttemptComplete}
            onToggleSidebar={() => setIsSidebarOpen(false)}
            setLocale={setLocale}
            onUpdateSessionSetup={updateSessionSetup}
            onToggleTheme={toggleTheme}
            onStartSession={startNewSession}
            onOpenScreen={setScreen}
          />
        )}
      </main>
    </div>
  );
}

export default App;
