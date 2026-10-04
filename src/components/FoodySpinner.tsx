import FoodyLogo from './brand/FoodyLogo';

/** Branded rotating loader using the approved C2 symbol. */
export function FoodySpinner({
  size = 20,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <FoodyLogo
      variant="symbol"
      decorative
      width={size}
      height={size}
      className={`animate-spin select-none ${className}`}
      style={{ animationDuration: '1.2s', animationTimingFunction: 'linear' }}
    />
  );
}
