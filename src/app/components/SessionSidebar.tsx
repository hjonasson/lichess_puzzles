import { useMemo, useState } from "react";
import { featureFlags } from "../../feature_flags";
import { useI18n, type Locale } from "../../i18n";
import styles from "../../App.module.css";
import { buildSolutionMoveRows } from "../chess";
import type {
  Puzzle,
  Screen,
  SessionGameCategory,
  SessionSetup,
  SessionStats,
  SessionThemeOption,
} from "../types";

const countFormatter = new Intl.NumberFormat("en-US");

function withCount(label: string, count: number) {
  return `${label} (${countFormatter.format(count)})`;
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

type SessionSidebarProps = {
  sessionStats: SessionStats;
  remainingCount: number;
  sessionCompletion: number;
  currentPuzzle: Puzzle;
  sessionSetup: SessionSetup;
  activeSessionSetup: SessionSetup;
  activeScreenTitle: string;
  sessionGameLabel: string;
  sessionThemeSummary: string;
  sessionOptionGames: SessionGameCategory[];
  sessionOptionThemes: SessionThemeOption[];
  ratingBounds: { min: number; max: number };
  locale: Locale;
  localeOptions: { value: Locale; label: string }[];
  productName: string;
  appVersion: string;
  resultLabel: string;
  activeAttemptComplete: boolean;
  onToggleSidebar: () => void;
  setLocale: (locale: Locale) => void;
  onUpdateSessionSetup: <Key extends keyof SessionSetup>(
    key: Key,
    value: SessionSetup[Key],
  ) => void;
  onToggleTheme: (theme: string) => void;
  onStartSession: () => void;
  onOpenScreen: (screen: Screen) => void;
};

export function SessionSidebar({
  sessionStats,
  remainingCount,
  sessionCompletion,
  currentPuzzle,
  sessionSetup,
  activeSessionSetup,
  activeScreenTitle,
  sessionGameLabel,
  sessionThemeSummary,
  sessionOptionGames,
  sessionOptionThemes,
  ratingBounds,
  locale,
  localeOptions,
  productName,
  appVersion,
  resultLabel,
  activeAttemptComplete,
  onToggleSidebar,
  setLocale,
  onUpdateSessionSetup,
  onToggleTheme,
  onStartSession,
  onOpenScreen,
}: SessionSidebarProps) {
  const { strings } = useI18n();
  const solutionRows = buildSolutionMoveRows(
    currentPuzzle.fen,
    currentPuzzle.moves,
  );
  const [themeSearch, setThemeSearch] = useState("");
  const matchedCategory = sessionOptionGames.find((category) =>
    category.openings.some((opening) => opening.id === sessionSetup.game),
  );
  const matchedOpening = matchedCategory?.openings.find(
    (opening) => opening.id === sessionSetup.game,
  );
  const activeCategory =
    sessionOptionGames.find(
      (category) => category.id === matchedCategory?.id,
    ) ?? null;
  const ratingSpan = Math.max(ratingBounds.max - ratingBounds.min, 1);
  const minPercent =
    ((sessionSetup.minRating - ratingBounds.min) / ratingSpan) * 100;
  const maxPercent =
    ((sessionSetup.maxRating - ratingBounds.min) / ratingSpan) * 100;
  const themeSummary = summarizeSelectedThemes(
    sessionSetup.themes,
    sessionOptionThemes,
    strings.labels.allThemes,
  );
  const filteredThemeOptions = useMemo(() => {
    const query = themeSearch.trim().toLowerCase();
    if (!query) {
      return sessionOptionThemes;
    }

    return sessionOptionThemes.filter((theme) => {
      const label = theme.label.toLowerCase();
      const id = theme.id.toLowerCase();
      return label.includes(query) || id.includes(query);
    });
  }, [sessionOptionThemes, themeSearch]);

  return (
    <aside className={`${styles.panel} ${styles.sidebarPanel}`}>
      <div className={styles.sidebarHeaderRow}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onToggleSidebar}
          aria-label={strings.buttons.hideSidebar}
        >
          <span className={styles.closeIcon} aria-hidden="true">
            <span />
            <span />
          </span>
        </button>
      </div>

      <section className={styles.statusCard}>
        <div className={styles.sidebarStatusHeader}>
          <span className={styles.statusLabel}>
            {strings.status.activeSession}
          </span>
        </div>
        <span className={styles.statusValue}>{activeScreenTitle}</span>
        <div className={styles.pathText}>
          {resultLabel} · {productName} v{appVersion}
        </div>

        <label className={styles.languageControl}>
          <span className={styles.statusLabel}>{strings.labels.language}</span>
          <select
            className={styles.languageSelect}
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
          >
            {localeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className={styles.setupStack}>
        <section className={styles.setupGroup}>
          <div className={styles.setupHeaderRow}>
            <strong>{strings.labels.ratingFilter}</strong>
            <span>
              {sessionSetup.minRating}-{sessionSetup.maxRating}
            </span>
          </div>
          <div className={styles.dualRangeField}>
            <div className={styles.dualRange}>
              <div className={styles.dualRangeTrack}>
                <span
                  className={styles.dualRangeFill}
                  style={{
                    left: `${minPercent}%`,
                    width: `${Math.max(maxPercent - minPercent, 0)}%`,
                  }}
                />
              </div>
              <input
                className={styles.dualRangeInput}
                type="range"
                min={ratingBounds.min}
                max={ratingBounds.max}
                step={50}
                value={sessionSetup.minRating}
                aria-label={strings.labels.minRating}
                onChange={(event) =>
                  onUpdateSessionSetup(
                    "minRating",
                    Math.min(
                      Number(event.target.value),
                      sessionSetup.maxRating,
                    ),
                  )
                }
              />
              <input
                className={styles.dualRangeInput}
                type="range"
                min={ratingBounds.min}
                max={ratingBounds.max}
                step={50}
                value={sessionSetup.maxRating}
                aria-label={strings.labels.maxRating}
                onChange={(event) =>
                  onUpdateSessionSetup(
                    "maxRating",
                    Math.max(
                      Number(event.target.value),
                      sessionSetup.minRating,
                    ),
                  )
                }
              />
            </div>
            <div className={styles.dualRangeLabels}>
              <span>{ratingBounds.min}</span>
              <span>{ratingBounds.max}</span>
            </div>
          </div>
        </section>

        <section className={styles.setupGroup}>
          <div className={styles.setupHeaderRow}>
            <strong>{strings.labels.game}</strong>
            <span>
              {matchedOpening?.label ?? strings.labels.openingUnspecified}
            </span>
          </div>
          <div className={styles.rangeGrid}>
            <label className={styles.fieldLabel}>
              <span>{strings.labels.category}</span>
              <select
                className={styles.textField}
                value={activeCategory?.id ?? ""}
                onChange={(event) => {
                  const nextCategoryId = event.target.value;
                  const nextCategory = sessionOptionGames.find(
                    (category) => category.id === nextCategoryId,
                  );

                  onUpdateSessionSetup(
                    "game",
                    nextCategory?.openings[0]?.id ?? "",
                  );
                }}
              >
                <option value="">{strings.labels.openingUnspecified}</option>
                {sessionOptionGames.map((category) => (
                  <option key={category.id} value={category.id}>
                    {withCount(category.label, category.count)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.fieldLabel}>
              <span>{strings.labels.opening}</span>
              <select
                className={styles.textField}
                value={matchedOpening?.id ?? ""}
                disabled={!activeCategory}
                onChange={(event) =>
                  onUpdateSessionSetup("game", event.target.value)
                }
              >
                <option value="">
                  {activeCategory
                    ? strings.labels.openingUnspecified
                    : strings.labels.selectCategoryFirst}
                </option>
                {activeCategory?.openings.map((opening) => (
                  <option key={opening.id} value={opening.id}>
                    {withCount(opening.label, opening.count)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className={styles.setupGroup}>
          <div className={styles.setupHeaderRow}>
            <strong>{strings.labels.themes}</strong>
            <span>{themeSummary}</span>
          </div>
          <details className={styles.dropdownField}>
            <summary className={styles.dropdownSummary}>{themeSummary}</summary>
            <div className={styles.dropdownPanel}>
              <input
                className={styles.textField}
                type="search"
                value={themeSearch}
                placeholder={strings.labels.searchThemes}
                onChange={(event) => setThemeSearch(event.target.value)}
              />
              <div className={styles.themeOptionList}>
                {filteredThemeOptions.length > 0 ? (
                  filteredThemeOptions.map((theme) => {
                    const selected = sessionSetup.themes.includes(theme.id);

                    return (
                      <label
                        key={theme.id}
                        className={`${styles.themeOptionRow} ${
                          selected ? styles.themeOptionRowSelected : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => onToggleTheme(theme.id)}
                        />
                        <span>{theme.label}</span>
                      </label>
                    );
                  })
                ) : (
                  <p className={styles.dropdownEmpty}>
                    {strings.labels.noMatchingThemes}
                  </p>
                )}
              </div>
            </div>
          </details>
        </section>

        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onStartSession}
          >
            {strings.buttons.startSolving}
          </button>
          {featureFlags.libraryRoute && (
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => onOpenScreen("import")}
            >
              {strings.buttons.openLibrary}
            </button>
          )}
        </div>
      </div>

      <div className={styles.metricGrid}>
        <article className={styles.metricCard}>
          <span className={styles.metricValue}>{sessionStats.solved}</span>
          <span className={styles.metricLabel}>{strings.labels.solved}</span>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricValue}>{sessionStats.failed}</span>
          <span className={styles.metricLabel}>{strings.labels.failed}</span>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricValue}>{sessionStats.skipped}</span>
          <span className={styles.metricLabel}>{strings.labels.skipped}</span>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricValue}>{remainingCount}</span>
          <span className={styles.metricLabel}>{strings.labels.current}</span>
        </article>
      </div>

      <div className={styles.progressRow}>
        <span>{strings.labels.completion}</span>
        <strong>{sessionCompletion}%</strong>
      </div>

      <div className={styles.tagRow}>
        {currentPuzzle.themes.map((theme) => (
          <span key={theme} className={styles.tag}>
            {theme}
          </span>
        ))}
      </div>

      <div className={styles.detailStack}>
        <div className={styles.detailRow}>
          <span>{strings.labels.ratingFilter}</span>
          <strong>
            {activeSessionSetup.minRating}-{activeSessionSetup.maxRating}
          </strong>
        </div>
        <div className={styles.detailRow}>
          <span>{strings.labels.opening}</span>
          <strong>
            {activeSessionSetup.game
              ? sessionGameLabel
              : strings.labels.openingUnspecified}
          </strong>
        </div>
        <div className={styles.detailRow}>
          <span>{strings.labels.selectedThemes}</span>
          <strong>{sessionThemeSummary}</strong>
        </div>
        <div className={styles.detailRow}>
          <span>{strings.labels.saveMode}</span>
          <strong>{strings.labels.automatic}</strong>
        </div>
      </div>

      {activeAttemptComplete && (
        <>
          <h2>{strings.headings.solution}</h2>
          <ol className={styles.solutionList}>
            {solutionRows.map((row) => (
              <li
                key={`${row.moveNumber}-${row.whiteMove ?? "..."}-${row.blackMove ?? "..."}`}
                className={styles.solutionItem}
              >
                <span className={styles.solutionIndex}>{row.moveNumber}.</span>
                <span className={styles.code}>{row.whiteMove ?? "..."}</span>
                <span className={styles.code}>{row.blackMove ?? "..."}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  );
}
