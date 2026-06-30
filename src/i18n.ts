import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import enStringsJson from "./en/strings.json";
import isStringsJson from "./is/strings.json";

export type Strings = typeof enStringsJson;
export type Locale = "en" | "is";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  strings: Strings;
  localeOptions: { value: Locale; label: string }[];
};

const localeStorageKey = "lichess-puzzles-locale";
const localeStrings: Record<Locale, Strings> = {
  en: enStringsJson,
  is: isStringsJson,
};
const localeOptions = [
  { value: "en", label: "English" },
  { value: "is", label: "Íslenska" },
] as const;

const I18nContext = createContext<I18nContextValue | null>(null);

function resolveInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return "en";
  }

  const storedLocale = window.localStorage.getItem(localeStorageKey);
  if (storedLocale === "en" || storedLocale === "is") {
    return storedLocale;
  }

  return window.navigator.language.toLowerCase().startsWith("is")
    ? "is"
    : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(resolveInitialLocale);

  useEffect(() => {
    window.localStorage.setItem(localeStorageKey, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      strings: localeStrings[locale],
      localeOptions: [...localeOptions],
    }),
    [locale],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return context;
}

export type MessageState =
  | { key: "startPuzzle" }
  | { key: "skipPuzzle" }
  | {
      key: "failedMove";
      values: { attemptedMove: string; expectedMove: string };
    }
  | { key: "solved" }
  | { key: "correctMove" };

export function formatString(
  template: string,
  values: Record<string, number | string>,
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

export function toMoveLabel(strings: Strings, fen: string) {
  return fen.split(" ")[1] === "w"
    ? strings.labels.whiteToMove
    : strings.labels.blackToMove;
}

export function messageText(strings: Strings, message: MessageState) {
  switch (message.key) {
    case "startPuzzle":
      return strings.messages.startPuzzle;
    case "skipPuzzle":
      return strings.messages.skipPuzzle;
    case "failedMove":
      return formatString(strings.messages.failedMove, message.values);
    case "solved":
      return strings.messages.solved;
    case "correctMove":
      return strings.messages.correctMove;
  }
}
