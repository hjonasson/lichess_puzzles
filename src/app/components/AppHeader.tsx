import { useI18n } from "../../i18n";
import styles from "../../App.module.css";

type AppHeaderProps = {};

export function AppHeader({}: AppHeaderProps) {
  const { strings } = useI18n();

  return (
    <header className={styles.header}>
      <p className={styles.kicker}>{strings.app.kicker}</p>
    </header>
  );
}
