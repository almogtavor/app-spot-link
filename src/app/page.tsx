"use client";

import { useState } from "react";
import Image from "next/image";

type Platform = "spotify" | "appleMusic";

interface ConvertResult {
  sourcePlatform: Platform;
  targetPlatform: Platform;
  targetUrl: string;
  isFallbackSearch?: boolean;
  song: { title?: string; artist?: string; thumbnail?: string } | null;
  songLinkUrl: string;
}

const PLATFORM_NAMES: Record<Platform, string> = {
  spotify: "Spotify",
  appleMusic: "Apple Music",
};

const PLATFORM_COLORS: Record<Platform, string> = {
  spotify: "bg-[#1DB954] hover:bg-[#1ed760]",
  appleMusic: "bg-[#fc3c44] hover:bg-[#ff4d56]",
};

const PLATFORM_ICONS: Record<Platform, React.ReactNode> = {
  spotify: (
    <Image src="/spotify_logo.png" alt="Spotify" width={20} height={20} className="rounded-full" />
  ),
  appleMusic: (
    <Image src="/apple_music_logo.png" alt="Apple Music" width={20} height={20} className="rounded-xl" />
  ),
};

function detectPlatform(url: string): Platform | null {
  if (url.includes("open.spotify.com") || url.includes("spotify.com")) return "spotify";
  if (url.includes("music.apple.com") || url.includes("itunes.apple.com")) return "appleMusic";
  return null;
}

export default function Home() {
  const [inputUrl, setInputUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result.targetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleShare() {
    if (!result) return;
    const text = result.song
      ? `${result.song.title} - ${result.song.artist}`
      : "Check out this song";
    if (navigator.share) {
      navigator.share({ title: text, url: result.targetUrl });
    } else {
      handleCopy();
    }
  }

  const sourcePlatform = detectPlatform(inputUrl);
  const targetPlatform: Platform | null =
    sourcePlatform === "spotify" ? "appleMusic" : sourcePlatform === "appleMusic" ? "spotify" : null;

  async function handleConvert(e: React.FormEvent) {
    e.preventDefault();
    if (!inputUrl.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);

    try {
      const res = await fetch(`/api/convert?url=${encodeURIComponent(inputUrl.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error - please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg space-y-10">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Image src="/spotify_logo.png" alt="Spotify" width={40} height={40} className="rounded-full" />
            <h1 className="text-4xl font-bold tracking-tight">SpotLink</h1>
            <Image src="/apple_music_logo.png" alt="Apple Music" width={40} height={40} className="rounded-xl" />
          </div>
          <p className="text-zinc-400 text-lg">
            Convert songs between Spotify and Apple Music
          </p>
        </div>

        {/* Input form */}
        <form onSubmit={handleConvert} className="space-y-4">
          <div className="relative">
            <input
              type="url"
              value={inputUrl}
              onChange={(e) => {
                setInputUrl(e.target.value);
                setResult(null);
                setError(null);
              }}
              placeholder="Paste a Spotify or Apple Music link..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-4 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 transition pr-12 text-sm"
            />
            {inputUrl && (
              <button
                type="button"
                onClick={() => { setInputUrl(""); setResult(null); setError(null); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition"
                aria-label="Clear"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                </svg>
              </button>
            )}
          </div>

          {/* Platform indicator */}
          {sourcePlatform && (
            <div className="flex items-center gap-2 text-sm text-zinc-400 px-1">
              <span className={`inline-flex items-center gap-1.5 ${sourcePlatform === "spotify" ? "text-[#1DB954]" : "text-[#fc3c44]"}`}>
                {PLATFORM_ICONS[sourcePlatform]}
                {PLATFORM_NAMES[sourcePlatform]} link detected
              </span>
              <span className="text-zinc-600">-</span>
              <span>will convert to {PLATFORM_NAMES[targetPlatform!]}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !inputUrl.trim() || !sourcePlatform}
            className={`w-full py-4 rounded-xl font-semibold text-white transition flex items-center justify-center gap-2 ${
              targetPlatform
                ? `${PLATFORM_COLORS[targetPlatform]} cursor-pointer`
                : "bg-zinc-800 cursor-not-allowed text-zinc-500"
            } disabled:opacity-60`}
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Converting...
              </>
            ) : targetPlatform ? (
              <>
                {PLATFORM_ICONS[targetPlatform]}
                Search in {PLATFORM_NAMES[targetPlatform]}
              </>
            ) : (
              "Paste a music link above"
            )}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden">
            {result.song?.thumbnail && (
              <div className="flex items-center gap-4 p-4 border-b border-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.song.thumbnail}
                  alt={result.song.title ?? "Song cover"}
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                />
                <div className="min-w-0">
                  {result.song.title && (
                    <p className="font-semibold text-white truncate">{result.song.title}</p>
                  )}
                  {result.song.artist && (
                    <p className="text-zinc-400 text-sm truncate">{result.song.artist}</p>
                  )}
                </div>
              </div>
            )}

            <div className="p-4 space-y-3">
              {result.isFallbackSearch && (
                <p className="text-zinc-400 text-xs text-center">
                  Exact match not found - opening search results instead
                </p>
              )}
              <a
                href={result.targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-white transition ${PLATFORM_COLORS[result.targetPlatform]}`}
              >
                {PLATFORM_ICONS[result.targetPlatform]}
                {result.isFallbackSearch ? `Open on ${PLATFORM_NAMES[result.targetPlatform]}` : `Search on ${PLATFORM_NAMES[result.targetPlatform]}`}
              </a>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={result.targetUrl}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 text-xs focus:outline-none truncate"
                />
                <button
                  onClick={handleCopy}
                  className={`flex-shrink-0 border rounded-lg px-3 py-2 text-xs transition-all duration-200 min-w-[52px] ${
                    copied
                      ? "bg-green-900/50 border-green-700 text-green-400 scale-105"
                      : "bg-zinc-800 border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white"
                  }`}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={handleShare}
                  className="flex-shrink-0 bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-2 text-zinc-400 hover:text-white transition"
                  aria-label="Share"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
