"use client";

import { Search, X } from "lucide-react";
import { useState } from "react";
import { SearchResultsContent } from "@/components/search/SearchView";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ShelfSkeleton } from "@/components/ui/Shelf";
import { ErrorState } from "@/components/ui/States";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSearch } from "@/hooks/useSearch";
import { cn } from "@/lib/cn";

const LANGUAGES = [
  { label: "Hindi", query: "Hindi hits" },
  { label: "Punjabi", query: "Punjabi hits" },
  { label: "Tamil", query: "Tamil hits" },
  { label: "Telugu", query: "Telugu hits" },
  { label: "Malayalam", query: "Malayalam hits" },
  { label: "Bengali", query: "Bengali hits" },
  { label: "Marathi", query: "Marathi hits" },
  { label: "Kannada", query: "Kannada hits" },
];

export function IndianMusicView() {
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState(LANGUAGES[0].query);
  const query = useDebouncedValue(input.trim() || selected, 300);
  const search = useSearch(query, "jiosaavn");

  return (
    <div>
      <PageHeader
        eyebrow="India · all languages"
        title="Indian music"
        description="Search songs, find singers, and play Indian playlists without leaving OS Vibes."
      />

      <form
        role="search"
        className="border-border bg-background/90 sticky top-12 z-20 -mx-4 mb-5 border-b px-4 py-4 backdrop-blur-xl md:-mx-8 md:px-8"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="relative block max-w-2xl">
          <span className="sr-only">Search Indian songs, singers, and playlists</span>
          <Search className="text-primary pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2" />
          <input
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setSelected("");
            }}
            placeholder="Search Indian songs, singers, playlists…"
            autoComplete="off"
            maxLength={100}
            className="border-border bg-card/60 placeholder:text-subtle focus:border-primary/60 h-13 w-full rounded-lg border pr-12 pl-12 text-lg tracking-[-0.02em] transition-shadow focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_14%,transparent)] focus:outline-none"
          />
          {input && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setInput("");
                setSelected(LANGUAGES[0].query);
              }}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1.5"
            >
              <X className="size-5" />
            </button>
          )}
        </label>
      </form>

      <div className="mb-8 flex flex-wrap gap-2" aria-label="Browse Indian languages">
        {LANGUAGES.map((language) => (
          <button
            key={language.label}
            type="button"
            aria-pressed={!input && selected === language.query}
            onClick={() => {
              setInput("");
              setSelected(language.query);
            }}
            className={cn(
              "language-chip label-mono rounded-full border px-3 py-2 transition-colors",
              !input && selected === language.query
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card/50 text-muted-foreground hover:text-foreground",
            )}
          >
            {language.label}
          </button>
        ))}
      </div>

      {search.status === "loading" && (
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading Indian music…</span>
          <ShelfSkeleton title="Songs" />
          <ShelfSkeleton title="Indian singers" round />
          <ShelfSkeleton title="Indian playlists" />
        </div>
      )}
      {search.status === "error" && (
        <ErrorState
          title="Indian music is unavailable"
          message={search.message}
          action={<Button onClick={search.retry}>Try again</Button>}
        />
      )}
      {search.status === "success" && <SearchResultsContent results={search.results} />}
    </div>
  );
}
