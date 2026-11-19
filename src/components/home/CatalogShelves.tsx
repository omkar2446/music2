import { ArtistCard } from "@/components/artists/ArtistCard";
import { PlaylistCard } from "@/components/playlists/PlaylistCard";
import { TrackCard } from "@/components/tracks/TrackCard";
import { TrackShelf } from "@/components/tracks/TrackShelf";
import { SectionHeading, Shelf } from "@/components/ui/Shelf";
import { ErrorState } from "@/components/ui/States";
import { routes } from "@/lib/routes";
import { describeProviderError, musicService } from "@/services/music/music.service";
import type { Playlist, Track } from "@/types/music";

/** Server-rendered catalog shelves. Each one fails independently so one bad request can't blank the page. */

function ShelfError({ title, error, index }: { title: string; error: unknown; index?: number }) {
  return (
    <section className="mb-12">
      <SectionHeading title={title} index={index} eyebrow="Signal lost" />
      <ErrorState message={describeProviderError(error)} />
    </section>
  );
}

export async function TrendingTracksShelf({
  title,
  eyebrow,
  index,
  underground,
  genre,
  href,
}: {
  title: string;
  eyebrow?: string;
  index?: number;
  underground?: boolean;
  genre?: string;
  href?: string;
}) {
  let tracks: Track[];
  try {
    tracks = await musicService.getTrending({ underground, genre, limit: 20 });
  } catch (error) {
    return <ShelfError title={title} error={error} index={index} />;
  }
  return (
    <TrackShelf
      title={title}
      subtitle={eyebrow}
      index={index}
      href={href}
      tracks={tracks.filter((t) => t.isPlayable)}
    />
  );
}

export async function TrendingPlaylistsShelf({
  title,
  eyebrow,
  index,
}: {
  title: string;
  eyebrow?: string;
  index?: number;
}) {
  let playlists: Playlist[];
  try {
    playlists = await musicService.getTrendingPlaylists(14);
  } catch (error) {
    return <ShelfError title={title} error={error} index={index} />;
  }
  if (playlists.length === 0) return null;
  return (
    <Shelf title={title} subtitle={eyebrow} index={index}>
      {playlists.map((p) => (
        <PlaylistCard key={p.id} playlist={p} />
      ))}
    </Shelf>
  );
}

/** Indian tracks, singers, and playlists from the JioSaavn catalog. */
export async function IndianMusicShelf() {
  const indianQueries = [
    "Hindi hits",
    "Punjabi hits",
    "Tamil hits",
    "Telugu hits",
    "Malayalam hits",
    "Bengali hits",
    "Marathi hits",
    "Marathi romantic songs",
    "Marathi classics",
    "Marathi devotional songs",
    "Kannada hits",
  ];
  const searches = await Promise.allSettled(
    indianQueries.map((query) => musicService.searchWith("jiosaavn", query, 24)),
  );
  const marathiPlaylists = Array.from(
    new Map(
      searches
        .flatMap((result, index) =>
          indianQueries[index].startsWith("Marathi") && result.status === "fulfilled"
            ? result.value.playlists
            : [],
        )
        .map((playlist) => [playlist.id, playlist]),
    ).values(),
  ).slice(0, 36);
  const marathiPlaylistIds = new Set(marathiPlaylists.map((playlist) => playlist.id));
  const tracks = Array.from(
    new Map(
      searches
        .flatMap((result) => (result.status === "fulfilled" ? result.value.tracks : []))
        .filter((track) => track.isPlayable)
        .map((track) => [track.id, track]),
    ).values(),
  ).slice(0, 20);
  const artists = Array.from(
    new Map(
      searches
        .flatMap((result) => (result.status === "fulfilled" ? result.value.artists : []))
        .map((artist) => [artist.id, artist]),
    ).values(),
  ).slice(0, 24);
  const playlists = Array.from(
    new Map(
      searches
        .flatMap((result) => (result.status === "fulfilled" ? result.value.playlists : []))
        .filter((playlist) => !marathiPlaylistIds.has(playlist.id))
        .map((playlist) => [playlist.id, playlist]),
    ).values(),
  ).slice(0, 36);

  if (tracks.length + artists.length + playlists.length === 0) {
    const failure = searches.find((result) => result.status === "rejected");
    if (failure && searches.every((result) => result.status === "rejected")) {
      return <ShelfError title="Indian music" error={failure.reason} index={2} />;
    }
    return null;
  }
  return (
    <div>
      {tracks.length > 0 && (
        <section className="mb-10" aria-label="Indian songs">
          <SectionHeading title="Indian music" eyebrow="Hindi · Punjabi · Tamil" index={2} href={routes.indian} />
          <div className="-mx-4 flex snap-x scroll-px-4 scrollbar-none gap-3 overflow-x-auto px-4 pb-2 md:-mx-8 md:scroll-px-8 md:px-8">
            {tracks.map((track, index) => <TrackCard key={track.id} track={track} tracks={tracks} index={index} />)}
          </div>
        </section>
      )}
      {artists.length > 0 && (
        <Shelf title="Indian singers" subtitle="Artists" href={routes.indian}>
          {artists.map((artist) => <ArtistCard key={artist.id} artist={artist} />)}
        </Shelf>
      )}
      {marathiPlaylists.length > 0 && (
        <Shelf title="Marathi playlists" subtitle="Regional favorites" href={routes.indian}>
          {marathiPlaylists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} />)}
        </Shelf>
      )}
      {playlists.length > 0 && (
        <Shelf title="Indian playlists" subtitle="Made for every mood" href={routes.indian}>
          {playlists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} />)}
        </Shelf>
      )}
    </div>
  );
}
