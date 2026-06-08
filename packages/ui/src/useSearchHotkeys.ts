import { useEffect, type RefObject } from "react";

type UseSearchHotkeysOptions = {
  searchInputRef: RefObject<HTMLInputElement | null>;
  onEscape: () => void;
};

export function useSearchHotkeys({
  searchInputRef,
  onEscape,
}: UseSearchHotkeysOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === "Escape") {
        onEscape();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onEscape, searchInputRef]);
}
