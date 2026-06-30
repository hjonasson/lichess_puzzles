import { Chessboard, type PieceDropHandlerArgs } from "react-chessboard";
import {
  formatString,
  messageText,
  toMoveLabel,
  useI18n,
  type MessageState,
} from "../../i18n";
import styles from "../../App.module.css";
import { screenShortcutHint, screenShortcuts } from "../constants";
import type { AttemptState, MoveFeedback, Puzzle } from "../types";

type SolveScreenProps = {
  currentPuzzle: Puzzle;
  boardPosition: string;
  boardOrientation: "white" | "black";
  isSidebarOpen: boolean;
  interactionLocked: boolean;
  attemptState: AttemptState;
  moveFeedback: MoveFeedback;
  squareStyles: Record<string, React.CSSProperties>;
  resultLabel: string;
  resultToneClassName: string;
  message: MessageState;
  activeAttemptComplete: boolean;
  onToggleSidebar: () => void;
  onResetPuzzle: () => void;
  onLoadNextPuzzle: () => void;
  onSkipPuzzle: () => void;
  onPieceClick: ({ square }: { square: string | null }) => void;
  onSquareClick: ({ square }: { square: string }) => void;
  onPieceDrop: ({
    sourceSquare,
    targetSquare,
  }: PieceDropHandlerArgs) => boolean;
};

export function SolveScreen({
  currentPuzzle,
  boardPosition,
  boardOrientation,
  isSidebarOpen,
  interactionLocked,
  attemptState,
  moveFeedback,
  squareStyles,
  resultLabel,
  resultToneClassName,
  message,
  activeAttemptComplete,
  onToggleSidebar,
  onResetPuzzle,
  onLoadNextPuzzle,
  onSkipPuzzle,
  onPieceClick,
  onSquareClick,
  onPieceDrop,
}: SolveScreenProps) {
  const { strings } = useI18n();

  return (
    <section className={`${styles.panel} ${styles.boardPanel}`}>
      <div className={styles.boardHeader}>
        <div className={styles.boardHeaderActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onResetPuzzle}
          >
            {strings.buttons.resetPuzzle}
          </button>
          {!isSidebarOpen && (
            <button
              type="button"
              className={styles.iconButton}
              onClick={onToggleSidebar}
              aria-label={strings.buttons.showSidebar}
            >
              <span className={styles.hamburgerIcon} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
          )}
        </div>
      </div>

      <div className={styles.boardMeta}>
        <span className={styles.tag}>
          {formatString(strings.labels.rating, {
            rating: currentPuzzle.rating,
          })}
        </span>
        <span className={styles.tag}>
          {toMoveLabel(strings, boardPosition)}
        </span>
        <span className={`${styles.statusPill} ${resultToneClassName}`}>
          {resultLabel}
        </span>
      </div>

      <div
        className={`${styles.boardWrap} ${
          moveFeedback === "success"
            ? styles.boardWrapSuccess
            : moveFeedback === "failure"
              ? styles.boardWrapFailure
              : ""
        }`}
      >
        <Chessboard
          options={{
            id: "lichess-puzzles-board",
            position: boardPosition,
            boardOrientation,
            allowDragging: attemptState === "active" && !interactionLocked,
            squareStyles,
            onPieceClick,
            onSquareClick,
            onPieceDrop,
          }}
        />
      </div>

      <div className={styles.shortcutRow}>
        {screenShortcuts.length > 1 && (
          <span className={styles.shortcutHint}>
            <kbd>{screenShortcutHint}</kbd> {strings.shortcuts.screens}
          </span>
        )}
        <span className={styles.shortcutHint}>
          <kbd>Arrows</kbd> {strings.shortcuts.moveFocus}
        </span>
        <span className={styles.shortcutHint}>
          <kbd>Enter</kbd> {strings.shortcuts.selectOrMove}
        </span>
        <span className={styles.shortcutHint}>
          <kbd>R</kbd> {strings.shortcuts.reset}
        </span>
        <span className={styles.shortcutHint}>
          <kbd>S</kbd> {strings.shortcuts.skip}
        </span>
        <span className={styles.shortcutHint}>
          <kbd>N</kbd> {strings.shortcuts.nextPuzzle}
        </span>
        <span className={styles.shortcutHint}>
          <kbd>Esc</kbd> {strings.shortcuts.clear}
        </span>
      </div>

      <div
        className={`${styles.message} ${
          attemptState === "solved"
            ? styles.messageSolved
            : attemptState === "failed"
              ? styles.messageFailed
              : attemptState === "skipped"
                ? styles.messageSkipped
                : ""
        }`}
      >
        {messageText(strings, message)}
      </div>

      <div className={styles.actionRow}>
        {activeAttemptComplete ? (
          <>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onLoadNextPuzzle}
            >
              {strings.buttons.nextPuzzle}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onResetPuzzle}
            >
              {strings.buttons.retryPuzzle}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onResetPuzzle}
            >
              {strings.buttons.restartPuzzle}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onSkipPuzzle}
            >
              {strings.buttons.skipPuzzle}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
