import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  asTheme,
  DEFAULT_THEME,
  THEME_KEY,
  THEME_LINES,
  THEME_NAMES,
  THEMES,
  type WakeTheme,
} from "@/lib/wake-theme";
import { Mark } from "./mark";

/**
 * Wake's theme, beside light and dark (theme-toggle.tsx): the same dropdown,
 * its trigger the mark of the theme that is on, each choice with its own.
 * The head script (lib/wake-theme.ts) has already applied the kept one.
 */
export function WakeThemePicker(): React.JSX.Element {
  const [theme, setTheme] = useState<WakeTheme>(DEFAULT_THEME);

  useEffect(() => {
    setTheme(asTheme(document.documentElement.dataset.wakeTheme));
  }, []);

  const pick = (value: string): void => {
    const next = asTheme(value);
    setTheme(next);
    document.documentElement.dataset.wakeTheme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage refused (a private window, blocked site data): the theme holds until the page closes.
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Wake theme"
          className="text-muted-foreground"
        >
          <Mark className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Wake theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={pick}>
          {THEMES.map((one) => (
            <DropdownMenuRadioItem key={one} value={one} className="items-start">
              <Mark theme={one} className="mt-0.5 size-5" />
              <span className="flex flex-col">
                <span className="font-medium text-foreground">{THEME_NAMES[one]}</span>
                <span className="text-xs text-muted-foreground">{THEME_LINES[one]}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
