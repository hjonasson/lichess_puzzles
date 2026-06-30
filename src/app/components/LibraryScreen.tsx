import { formatString, useI18n } from "../../i18n";
import styles from "../../App.module.css";
import type { Puzzle } from "../types";

type LibraryScreenProps = {
  datasetPath: string;
  currentPuzzle: Puzzle;
  samplePuzzleId: string;
  onContinueToSession: () => void;
};

export function LibraryScreen({
  datasetPath,
  currentPuzzle,
  samplePuzzleId,
  onContinueToSession,
}: LibraryScreenProps) {
  const { strings } = useI18n();

  return (
    <>
      <p className={styles.lede}>{strings.copy.libraryIntro}</p>
      <div className={styles.cardGrid}>
        <article className={styles.miniCard}>
          <strong>{strings.labels.dataset}</strong>
          <span className={styles.code}>{strings.cards.datasetFile}</span>
        </article>
        <article className={styles.miniCard}>
          <strong>{strings.labels.storage}</strong>
          <span>{datasetPath}</span>
        </article>
        <article className={styles.miniCard}>
          <strong>{strings.labels.status}</strong>
          <span>
            {currentPuzzle.id === samplePuzzleId
              ? strings.status.previewPuzzle
              : formatString(strings.status.loadedPuzzle, {
                  id: currentPuzzle.id,
                })}
          </span>
        </article>
        <article className={styles.miniCard}>
          <strong>{strings.labels.progress}</strong>
          <span>{strings.labels.autosavedOnDevice}</span>
        </article>
      </div>
      <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onContinueToSession}
        >
          {strings.buttons.continueToSession}
        </button>
      </div>
    </>
  );
}
