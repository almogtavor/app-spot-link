import { NextRequest, NextResponse } from "next/server";

type Platform = "spotify" | "appleMusic";

interface OdesliResponse {
  entityUniqueId: string;
  userCountry: string;
  pageUrl: string;
  entitiesByUniqueId: Record<string, {
    id: string;
    type: string;
    title?: string;
    artistName?: string;
    thumbnailUrl?: string;
    apiProvider: string;
    platforms: string[];
  }>;
  linksByPlatform: Record<string, {
    country: string;
    url: string;
    nativeAppUriMobile?: string;
    nativeAppUriDesktop?: string;
    entityUniqueId: string;
  }>;
}

function detectPlatform(url: string): Platform | null {
  if (url.includes("open.spotify.com") || url.includes("spotify.com")) {
    return "spotify";
  }
  if (url.includes("music.apple.com") || url.includes("itunes.apple.com")) {
    return "appleMusic";
  }
  return null;
}

// --- Spotify Client Credentials ---

let spotifyToken: string | null = null;
let spotifyTokenExpiry = 0;

async function getSpotifyToken(): Promise<string> {
  if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing Spotify credentials");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error("Failed to get Spotify token");
  const data = await res.json();
  spotifyToken = data.access_token;
  spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return spotifyToken!;
}

async function searchSpotify(title: string, artist: string): Promise<string | null> {
  const token = await getSpotifyToken();
  const query = `track:${title} artist:${artist}`;
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const track = data.tracks?.items?.[0];
  return track ? track.external_urls.spotify : null;
}

// --- Deezer Search API (free, no credentials) ---

async function searchDeezer(title: string, artist: string): Promise<{ spotifyUrl: string | null; appleMusicUrl: string | null }> {
  const query = `artist:"${artist}" track:"${title}"`;
  const res = await fetch(
    `https://api.deezer.com/search/track?q=${encodeURIComponent(query)}&limit=1`,
  );
  if (!res.ok) return { spotifyUrl: null, appleMusicUrl: null };
  const data = await res.json();
  const track = data.data?.[0];
  if (!track) return { spotifyUrl: null, appleMusicUrl: null };

  // Use the Deezer link with Odesli to resolve to other platforms
  const odesliRes = await fetch(
    `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(`https://www.deezer.com/track/${track.id}`)}&userCountry=US`,
  );
  if (!odesliRes.ok) return { spotifyUrl: null, appleMusicUrl: null };
  const odesliData: OdesliResponse = await odesliRes.json();
  return {
    spotifyUrl: odesliData.linksByPlatform?.spotify?.url ?? null,
    appleMusicUrl: odesliData.linksByPlatform?.appleMusic?.url ?? null,
  };
}

// --- iTunes Search API (no credentials needed) ---

async function searchAppleMusic(title: string, artist: string): Promise<string | null> {
  const query = `${artist} ${title}`;
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  const track = data.results?.[0];
  if (!track?.trackViewUrl) return null;
  return track.trackViewUrl.replace("itunes.apple.com", "music.apple.com");
}

// --- Rate limiter (per serverless instance) ---

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

const ipHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now >= entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// --- Origin check ---

const ALLOWED_ORIGINS = [
  "https://appspotlink.vercel.app",
  "http://localhost:3000",
];

function isAllowedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  // Allow server-side or same-origin requests with no origin header (direct nav)
  if (!origin && !referer) return false;
  if (origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) return true;
  if (referer && ALLOWED_ORIGINS.some((o) => referer.startsWith(o))) return true;
  return false;
}

// --- Main handler ---

export async function GET(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const sourcePlatform = detectPlatform(url);
  if (!sourcePlatform) {
    return NextResponse.json(
      { error: "URL must be from Spotify (open.spotify.com) or Apple Music (music.apple.com)" },
      { status: 400 }
    );
  }

  const odesliUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}&userCountry=US`;

  const response = await fetch(odesliUrl, {
    headers: { "Accept": "application/json" },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return NextResponse.json({ error: "Song not found. Make sure the link is valid." }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to look up song" }, { status: 502 });
  }

  const data: OdesliResponse = await response.json();

  const targetPlatform: Platform = sourcePlatform === "spotify" ? "appleMusic" : "spotify";
  let targetUrl: string | null = data.linksByPlatform[targetPlatform]?.url ?? null;

  // Find the source entity for metadata
  const sourceEntityId = data.linksByPlatform[sourcePlatform]?.entityUniqueId;
  const entity = sourceEntityId ? data.entitiesByUniqueId[sourceEntityId] : null;
  const song = entity
    ? { title: entity.title, artist: entity.artistName, thumbnail: entity.thumbnailUrl }
    : null;

  // Fallback chain when Odesli doesn't have the target platform link:
  // 1. Deezer search -> Odesli resolve (free, no credentials)
  // 2. Spotify API search (requires Premium credentials)
  // 3. iTunes Search API (free, for Apple Music targets)
  if (!targetUrl && song?.title && song?.artist) {
    try {
      const deezerResult = await searchDeezer(song.title, song.artist);
      targetUrl = targetPlatform === "spotify" ? deezerResult.spotifyUrl : deezerResult.appleMusicUrl;
    } catch (e) {
      console.error("Deezer fallback failed:", e);
    }

    if (!targetUrl) {
      try {
        if (targetPlatform === "spotify") {
          targetUrl = await searchSpotify(song.title, song.artist);
        } else {
          targetUrl = await searchAppleMusic(song.title, song.artist);
        }
      } catch (e) {
        console.error("Direct search fallback failed:", e);
      }
    }
  }

  // Last resort: link to search page on the target platform
  let isFallbackSearch = false;
  if (!targetUrl && song?.title && song?.artist) {
    const query = [song.artist, song.title].filter(Boolean).join(" ");
    if (targetPlatform === "spotify") {
      targetUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
    } else {
      targetUrl = `https://music.apple.com/search?term=${encodeURIComponent(query)}`;
    }
    isFallbackSearch = true;
  }

  if (!targetUrl) {
    const platformName = targetPlatform === "appleMusic" ? "Apple Music" : "Spotify";
    return NextResponse.json(
      { error: `Could not find this song on ${platformName}` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    sourcePlatform,
    targetPlatform,
    targetUrl,
    isFallbackSearch,
    song,
    songLinkUrl: data.pageUrl,
  });
}
