'use client';

// Square image thumbnail for combo composer rows. Uses a plain <img> instead
// of next/image so any uploaded image URL renders without needing the host
// added to next.config remotePatterns — the combo composer pulls items from
// every menu source the operator has uploaded to.

interface Props {
  url?: string;
  /** Pixel size. Defaults to 28 (the choice-step row); fixed-step rows use 36. */
  size?: number;
}

export default function Thumb({ url, size = 28 }: Props) {
  const dim = { width: size, height: size };
  if (url) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return (
      <img
        src={url}
        alt=""
        style={dim}
        className="rounded-r-sm object-cover bg-[var(--surface-3)] shrink-0"
      />
    );
  }
  return (
    <div
      style={{
        ...dim,
        background: 'var(--surface-3)',
        backgroundImage:
          'repeating-linear-gradient(45deg, color-mix(in oklab, var(--fg) 14%, transparent) 0 4px, transparent 4px 8px)',
      }}
      className="rounded-r-sm shrink-0"
      aria-hidden
    />
  );
}
