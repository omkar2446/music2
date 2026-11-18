import type { MusicProvider, ProviderInfo, RecommendationSeed } from "@/providers/types";
import { ProviderError } from "@/providers/types";
import { globalId, type Artist, type ArtistDetails, type ArtistRef, type ImageSet, type Playlist, type PlaylistDetails, type SearchResults, type Track, type TrackDetails } from "@/types/music";

type Link = { quality: string; url: string };
type SaavnArtist = {
  id: string;
  name: string;
  url?: string;
  image?: Link[];
  followerCount?: number | null;
  isVerified?: boolean | null;
  bio?: Array<{ text?: string | null; title?: string | null }> | null;
  topSongs?: SaavnSong[] | null;
  topAlbums?: SaavnPlaylist[] | null;
  similarArtists?: Array<{ id: string; name: string; url?: string; image?: Link[] }> | null;
};
type SaavnSong = {
  id: string;
  name: string;
  duration: number | null;
  playCount: number | null;
  language: string;
  url: string;
  image: Link[];
  downloadUrl: Link[];
  album: { id: string | null; name: string | null; url: string | null };
  artists: { primary: SaavnArtist[]; featured: SaavnArtist[]; all: SaavnArtist[] };
};
type SaavnPlaylist = {
  id: string;
  name: string;
  description: string | null;
  year: number | null;
  playCount: number | null;
  songCount: number | null;
  url: string;
  image: Link[];
  songs: SaavnSong[] | null;
  artists: SaavnArtist[] | null;
};
type SaavnSearchPlaylist = {
  id: string;
  name: string;
  type: string;
  ownerName?: string;
  image: Link[];
  url: string;
  songCount: number | null;
  language: string;
  explicitContent: boolean;
};
type Envelope<T> = { success: boolean; data?: T; message?: string };

const SOURCE = "jiosaavn" as const;
const API_BASE = (process.env.JIOSAAVN_API_BASE_URL ?? "http://127.0.0.1:3101").replace(/\/$/, "");
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

async function api<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(path, `${API_BASE}/`);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, String(value));

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ProviderError("unavailable", "JioSaavn service is offline");
  }
  if (!response.ok) throw new ProviderError("unavailable", "JioSaavn service request failed", response.status);
  const envelope = (await response.json()) as Envelope<T>;
  if (!envelope.success || envelope.data === undefined) {
    throw new ProviderError("unavailable", envelope.message ?? "JioSaavn returned no data");
  }
  return envelope.data;
}

function assertId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new ProviderError("not_found", "Invalid JioSaavn ID");
  return id;
}

function artwork(links?: Link[]): ImageSet | undefined {
  if (!links?.length) return undefined;
  const find = (...needles: string[]) => links.find((link) => needles.some((needle) => link.quality.includes(needle)))?.url;
  const fallback = links.at(-1)?.url;
  return {
    small: find("50x50", "small") ?? links[0]?.url ?? fallback,
    medium: find("150x150", "medium", "250x250") ?? links[Math.floor(links.length / 2)]?.url ?? fallback,
    large: find("500x500", "large") ?? fallback,
  };
}

function artistRef(artist?: SaavnArtist): ArtistRef {
  const safe = artist ?? { id: "unknown", name: "Unknown artist" };
  return {
    id: globalId(SOURCE, safe.id),
    name: safe.name || "Unknown artist",
    image: artwork(safe.image),
  };
}

function mapTrack(song: SaavnSong): Track {
  const stream = [...(song.downloadUrl ?? [])].reverse().find((link) => link.url)?.url;
  const artist = song.artists?.primary?.[0] ?? song.artists?.all?.[0];
  return {
    id: globalId(SOURCE, song.id),
    providerId: song.id,
    source: SOURCE,
    title: song.name || "Untitled",
    artist: artistRef(artist),
    artwork: artwork(song.image),
    duration: Math.max(0, Number(song.duration) || 0),
    streamUrl: stream,
    isPlayable: Boolean(stream),
    genre: song.language || undefined,
    playCount: song.playCount ?? undefined,
    externalUrl: song.url,
  };
}

function mapArtist(raw: SaavnArtist): Artist {
  return {
    ...artistRef(raw),
    providerId: raw.id,
    source: SOURCE,
    followerCount: raw.followerCount ?? undefined,
    isVerified: raw.isVerified ?? false,
    bio: raw.bio?.map((item) => item.text).filter(Boolean).join("\n\n") || undefined,
    externalUrl: raw.url,
  };
}

function mapPlaylist(raw: SaavnPlaylist): Playlist {
  return {
    id: globalId(SOURCE, raw.id),
    providerId: raw.id,
    source: SOURCE,
    title: raw.name || "Untitled playlist",
    isAlbum: false,
    owner: artistRef(raw.artists?.[0]),
    artwork: artwork(raw.image),
    description: raw.description ?? undefined,
    trackCount: raw.songCount ?? raw.songs?.length ?? 0,
    playCount: raw.playCount ?? undefined,
    externalUrl: raw.url,
  };
}

function mapSearchPlaylist(raw: SaavnSearchPlaylist): Playlist {
  return {
    id: globalId(SOURCE, raw.id),
    providerId: raw.id,
    source: SOURCE,
    title: raw.name || "Untitled playlist",
    isAlbum: raw.type === "album",
    owner: artistRef({ id: `playlist-${raw.id}`, name: raw.ownerName || "JioSaavn" }),
    artwork: artwork(raw.image),
    trackCount: raw.songCount ?? 0,
    externalUrl: raw.url,
  };
}

export class JioSaavnProvider implements MusicProvider {
  readonly info: ProviderInfo = {
    source: SOURCE,
    name: "JioSaavn",
    homepage: "https://www.jiosaavn.com/",
    capabilities: { search: true, directAudio: true, playlists: true, recommendations: true, artistProfiles: true, genres: true },
  };

  async search(query: string, limit = 10): Promise<SearchResults> {
    const params = { query, page: 0, limit: Math.min(Math.max(limit, 1), 40) };
    const [songs, artists, playlists] = await Promise.allSettled([
      api<{ results: SaavnSong[] }>("/api/search/songs", params),
      api<{ results: SaavnArtist[] }>("/api/search/artists", params),
      api<{ results: SaavnSearchPlaylist[] }>("/api/search/playlists", params),
    ]);
    const results = [songs, artists, playlists];
    if (results.every((result) => result.status === "rejected")) {
      throw results[0].status === "rejected"
        ? results[0].reason
        : new ProviderError("unavailable", "JioSaavn search failed");
    }
    return {
      query,
      tracks: songs.status === "fulfilled" ? songs.value.results.map(mapTrack) : [],
      artists: artists.status === "fulfilled" ? artists.value.results.map(mapArtist) : [],
      playlists: playlists.status === "fulfilled" ? playlists.value.results.map(mapSearchPlaylist) : [],
      albums: [],
    };
  }

  async getTrending(options: { genre?: string; limit?: number } = {}): Promise<Track[]> {
    const result = await this.search(options.genre ? `${options.genre} songs` : "Hindi trending songs", options.limit ?? 20);
    return result.tracks;
  }

  async getTrendingPlaylists(limit = 12): Promise<Playlist[]> {
    const results = await Promise.allSettled(
      ["Hindi playlist", "Punjabi playlist", "Tamil playlist"].map((query) => this.search(query, limit)),
    );
    return Array.from(
      new Map(
        results
          .flatMap((result) => (result.status === "fulfilled" ? result.value.playlists : []))
          .map((playlist) => [playlist.id, playlist]),
      ).values(),
    ).slice(0, limit);
  }

  async getTrack(id: string): Promise<TrackDetails> {
    const songs = await api<SaavnSong[]>(`/api/songs/${assertId(id)}`);
    if (!songs[0]) throw new ProviderError("not_found", "JioSaavn track not found");
    return mapTrack(songs[0]);
  }

  getStreamUrl(): string {
    // JioSaavn resolves a track's playable URL as part of its metadata response.
    return "";
  }

  async getArtist(id: string): Promise<ArtistDetails> {
    const raw = await api<SaavnArtist>(`/api/artists/${assertId(id)}`);
    return {
      ...mapArtist(raw),
      popularTracks: (raw.topSongs ?? []).map(mapTrack),
      playlists: (raw.topAlbums ?? []).map(mapPlaylist),
      relatedArtists: (raw.similarArtists ?? []).map((artist) => ({
        ...artistRef(artist),
        providerId: artist.id,
        source: SOURCE,
        externalUrl: artist.url,
      })),
    };
  }

  async getPlaylist(id: string): Promise<PlaylistDetails> {
    const raw = await api<SaavnPlaylist>("/api/playlists", { id: assertId(id), limit: 100, page: 0 });
    return { ...mapPlaylist(raw), tracks: (raw.songs ?? []).map(mapTrack) };
  }

  async getRecommendations(seed: RecommendationSeed, limit = 20): Promise<Track[]> {
    const query = seed.genre ? `${seed.genre} Indian music` : "Hindi music";
    return (await this.search(query, limit)).tracks;
  }
}
