/**
 * FoodySpinner — branded rotating loader using the Foody table+chairs symbol.
 *
 * Mirrors the Flutter `FoodySpinner` in foodypos/lib/shared/widgets/foody_spinner.dart.
 * Drop-in replacement for the generic `Loader2`/`SparklesIcon` spin you'd
 * otherwise reach for. Uses currentColor so the parent's text color drives
 * the fill — but since the SVG is delivered as a static asset, the brand
 * orange (#f18a47) ships baked in. That matches POS and is the right colour
 * on every surface we use it on today.
 *
 * Usage:
 *   <FoodySpinner />                      // 20px, 1.2s rotation
 *   <FoodySpinner size={40} />            // larger
 *   <FoodySpinner size={16} className="shrink-0" />
 */
export function FoodySpinner({
  size = 20,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/foody-symbol.svg"
      alt=""
      role="presentation"
      width={size}
      height={size}
      className={`animate-spin select-none ${className}`}
      style={{ animationDuration: '1.2s', animationTimingFunction: 'linear' }}
      draggable={false}
    />
  );
}
