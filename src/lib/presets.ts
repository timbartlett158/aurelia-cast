export interface CastPreset {
  label: string;
  url: string;
  format: "hls" | "mp4";
  note: string;
}

export const CAST_PRESETS: CastPreset[] = [
  {
    label: "Big Buck Bunny",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    format: "mp4",
    note: "CORS-open MP4 · 1080p",
  },
  {
    label: "Mux Test Stream",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    format: "hls",
    note: "CORS-open HLS ladder",
  },
  {
    label: "Sintel",
    url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
    format: "hls",
    note: "CORS-open HLS · 4-bitrate",
  },
  {
    label: "Tears of Steel",
    url: "https://test-streams.mux.dev/pts_shift/master.m3u8",
    format: "hls",
    note: "CORS-open HLS ladder",
  },
];

export function detectFormat(url: string): "hls" | "mp4" {
  return /\.m3u8(\?|$)/i.test(url) ? "hls" : "mp4";
}

export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? u.hostname;
    return last.replace(/\.(m3u8|mp4)$/i, "").replace(/[-_]+/g, " ").trim() || u.hostname;
  } catch {
    return url;
  }
}
