import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from "react";
import type { LayoutedGraphNode } from "./graphTypes";

type SearchBoxProps = {
  inputRef?: Ref<HTMLInputElement>;
  query: string;
  placeholder: string;
  results: LayoutedGraphNode[];
  resultCount: number;
  selectedNodeId: string | null;
  onQueryChange: (query: string) => void;
  onSelect: (nodeId: string) => void;
  onClear: () => void;
};

const searchContainerStyle: CSSProperties = {
  position: "relative",
  width: 320,
  maxWidth: "32vw",
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  height: 32,
  border: "1px solid #334155",
  borderRadius: 6,
  background: "#0f172a",
  color: "#e2e8f0",
  padding: "0 32px 0 10px",
  outline: "none",
};

const clearButtonStyle: CSSProperties = {
  position: "absolute",
  top: 5,
  right: 6,
  width: 22,
  height: 22,
  border: "none",
  borderRadius: 4,
  background: "transparent",
  color: "#94a3b8",
  cursor: "pointer",
};

const resultsContainerStyle: CSSProperties = {
  position: "absolute",
  top: 38,
  left: 0,
  right: 0,
  zIndex: 20,
  border: "1px solid #334155",
  borderRadius: 6,
  background: "#0b1220",
  boxShadow: "0 14px 32px rgba(0, 0, 0, 0.32)",
  overflow: "hidden",
};

function resultButtonStyle(
  isSelected: boolean,
  isHighlighted: boolean,
): CSSProperties {
  return {
    width: "100%",
    border: "none",
    borderBottom: "1px solid #1e293b",
    background: isSelected || isHighlighted ? "#1e3a8a" : "#0b1220",
    color: "#e2e8f0",
    padding: "8px 10px",
    cursor: "pointer",
    textAlign: "left",
  };
}

export default function SearchBox({
  inputRef,
  query,
  placeholder,
  results,
  resultCount,
  selectedNodeId,
  onQueryChange,
  onSelect,
  onClear,
}: SearchBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const hasQuery = query.trim().length > 0;
  const activeIndex =
    results.length > 0
      ? Math.min(highlightedIndex, results.length - 1)
      : 0;

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onQueryChange(event.target.value);
      setIsOpen(true);
    },
    [onQueryChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown" && results.length > 0) {
        event.preventDefault();
        setIsOpen(true);
        setHighlightedIndex((index) => (index + 1) % results.length);
        return;
      }

      if (event.key === "ArrowUp" && results.length > 0) {
        event.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(
          (index) => (index - 1 + results.length) % results.length,
        );
        return;
      }

      if (event.key === "Enter" && results[activeIndex]) {
        event.preventDefault();
        onSelect(results[activeIndex].id);
        setIsOpen(false);
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
      }
    },
    [activeIndex, onSelect, results],
  );

  const handleSelect = useCallback(
    (nodeId: string) => {
      onSelect(nodeId);
      setIsOpen(false);
    },
    [onSelect],
  );

  const handleClear = useCallback(() => {
    onClear();
    setIsOpen(false);
  }, [onClear]);

  return (
    <div
      style={searchContainerStyle}
      onBlur={() => {
        window.setTimeout(() => setIsOpen(false), 120);
      }}
    >
      <input
        ref={inputRef}
        aria-label={placeholder}
        type="search"
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        style={searchInputStyle}
      />
      {hasQuery ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={handleClear}
          style={clearButtonStyle}
        >
          x
        </button>
      ) : null}
      {isOpen && hasQuery ? (
        <div style={resultsContainerStyle}>
          {results.length > 0 ? (
            <>
              {results.map((node, index) => (
                <button
                  key={node.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => handleSelect(node.id)}
                  style={resultButtonStyle(
                    node.id === selectedNodeId,
                    index === activeIndex,
                  )}
                >
                  <div
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {node.data.label}
                  </div>
                  <div
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginTop: 3,
                      color: "#94a3b8",
                      fontSize: 11,
                    }}
                  >
                    {node.data.path}
                  </div>
                </button>
              ))}
              {resultCount > results.length ? (
                <div
                  style={{
                    padding: "7px 10px",
                    color: "#94a3b8",
                    fontSize: 11,
                  }}
                >
                  Showing {results.length} of {resultCount}
                </div>
              ) : null}
            </>
          ) : (
            <div
              style={{
                padding: "9px 10px",
                color: "#94a3b8",
                fontSize: 12,
              }}
            >
              No matching results
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
