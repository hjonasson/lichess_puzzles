import { useI18n } from "../../i18n";
import styles from "../../App.module.css";
import type { Screen, ScreenConfig } from "../types";

type StepNavProps = {
  screens: ScreenConfig[];
  screen: Screen;
  onSelectScreen: (screen: Screen) => void;
};

export function StepNav({ screens, screen, onSelectScreen }: StepNavProps) {
  const { strings } = useI18n();

  return (
    <nav
      className={styles.stepNav}
      aria-label={strings.accessibility.primaryScreens}
    >
      {screens.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={`${styles.stepButton} ${screen === item.id ? styles.stepActive : ""}`}
          onClick={() => onSelectScreen(item.id)}
        >
          <span className={styles.stepIndex}>{index + 1}</span>
          <span>
            <span className={styles.stepTitle}>{item.title}</span>
            <span className={styles.stepCopy}>{item.copy}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
