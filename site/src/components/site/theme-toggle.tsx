import { Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Theme = "auto" | "light" | "dark";

/** Starlight's own key and values ('' for auto), so its provider applies the choice on load. */
const KEY = "starlight-theme";
const parse = (value: unknown): Theme => (value === "light" || value === "dark" ? value : "auto");
const system = (): "light" | "dark" =>
  matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
const apply = (theme: Theme): void => {
  document.documentElement.dataset.theme = theme === "auto" ? system() : theme;
};

/** Light or dark: shadcn's mode toggle, a ghost icon button opening a dropdown menu. */
export function ThemeToggle(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    setTheme(parse(localStorage.getItem(KEY)));
    const query = matchMedia("(prefers-color-scheme: light)");
    const follow = (): void => {
      if (parse(localStorage.getItem(KEY)) === "auto") apply("auto");
    };
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  const pick = (value: string): void => {
    const next = parse(value);
    setTheme(next);
    localStorage.setItem(KEY, next === "auto" ? "" : next);
    apply(next);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Light or dark"
          className="text-muted-foreground"
        >
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={pick}>
          <DropdownMenuRadioItem value="light">
            <Sun />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="auto">
            <Laptop />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
