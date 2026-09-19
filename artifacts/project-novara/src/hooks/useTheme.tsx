// ============================================================================
// The React half of the theme choice. lib/theme.ts holds the rules; this holds
// the wiring.
//
// Three things have to stay in step whenever the theme changes:
//   1. the `.dark` class on <html>, which drives the whole palette
//   2. the native shell's status bar and tab bar, via the bridge
//   3. localStorage, so the choice survives a relaunch
//
// And when the choice is "system", the device can change it out from under us
// at sunset — hence the matchMedia listener rather than a one-time read.
// ============================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyTheme,
  readStoredChoice,
  resolveTheme,
  storeChoice,
  systemPrefersDark,
  DARK_MEDIA_QUERY,
  type ResolvedTheme,
  type ThemeChoice,
} from "@/lib/theme";
import { canOfferThemeChoice, setNativeTheme } from "@/lib/nativeBridge";

interface ThemeContextValue {
  /** What the user picked. */
  choice: ThemeChoice;
  /** What that currently resolves to. */
  resolved: ResolvedTheme;
  /** Whether the theme control should be shown at all. */
  canChoose: boolean;
  setChoice(choice: ThemeChoice): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Read synchronously on first render. index.html has already applied the
  // same value before paint, so this agrees with what is on screen rather
  // than causing a flash.
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readStoredChoice());
  const [prefersDark, setPrefersDark] = useState<boolean>(() => systemPrefersDark());

  // The device's setting is only interesting while the user is following it,
  // but the listener is cheap and unconditional listening keeps prefersDark
  // correct for the moment they switch back to "system".
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(DARK_MEDIA_QUERY);
    } catch {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolved = useMemo(
    () => resolveTheme(choice, prefersDark),
    [choice, prefersDark],
  );

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  // The shell gets the CHOICE, not the resolved theme, so "system" can map to
  // iOS's own .unspecified and follow the device without a round trip.
  useEffect(() => {
    setNativeTheme(choice);
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    storeChoice(next);
  }, []);

  // Capability is read once: the injected bridge is installed at document
  // start and does not appear later in a session.
  const canChoose = useMemo(() => canOfferThemeChoice(), []);

  const value = useMemo(
    () => ({ choice, resolved, canChoose, setChoice }),
    [choice, resolved, canChoose, setChoice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }
  return context;
}
