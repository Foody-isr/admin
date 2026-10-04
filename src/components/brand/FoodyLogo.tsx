// Generated from brand/foody/identity/v1/sources/geometry.json.
import type { SVGProps } from "react";

type FoodyLogoProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  variant?: "wordmark" | "symbol" | "lockup";
  monochrome?: boolean;
  decorative?: boolean;
};

/** Approved C2 identity, using inherited text color and a fixed Foody accent. */
export default function FoodyLogo({ variant = "wordmark", monochrome = false, decorative = false, width, style, ...props }: FoodyLogoProps) {
  const symbol = variant === "symbol";
  const lockup = variant === "lockup";
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={symbol ? "0 0 100 100" : lockup ? "0 0 451 128" : "0 0 348 128"}
      width={width ?? (symbol ? 24 : 116)}
      fillRule="evenodd"
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Foody"}
      aria-hidden={decorative || undefined}
      focusable="false"
      style={{ display: "block", flexShrink: 0, ...style, direction: "ltr" }}
    >
      {(symbol || lockup) && (
        <path transform={lockup ? "translate(0 25) scale(0.78)" : undefined} fill={monochrome ? "currentColor" : "#eb5204"} d="M30 0H96L81 26H38C30 26 26 30 26 38V61L0 76V30C0 12 12 0 30 0Z M70 100H4L19 74H62C70 74 74 70 74 62V39L100 24V70C100 88 88 100 70 100Z" />
      )}
      {!symbol && (
        <g fill="currentColor" transform={lockup ? "translate(103 0)" : undefined}>
          <path d="M8 100V40H0V30H8V22C8 7 17 0 31 0H45V10H32C23 10 18 14 18 23V30H41V40H18V100Z" />
          <path transform="translate(51 0)" d="M33.5 30C54 30 67 44 67 66C67 88 54 102 33.5 102C13 102 0 88 0 66C0 44 13 30 33.5 30Z M33.5 40C19 40 10 50 10 66C10 82 19 92 33.5 92C48 92 57 82 57 66C57 50 48 40 33.5 40Z" />
          <path transform="translate(129 0)" d="M33.5 30C54 30 67 44 67 66C67 88 54 102 33.5 102C13 102 0 88 0 66C0 44 13 30 33.5 30Z M33.5 40C19 40 10 50 10 66C10 82 19 92 33.5 92C48 92 57 82 57 66C57 50 48 40 33.5 40Z" />
          <path transform="translate(207 0)" d="M58 0H68V100H58V89C52 97 43 102 31 102C12 102 0 88 0 66C0 44 12 30 31 30C43 30 52 35 58 44Z M34 40C19 40 10 50 10 66C10 82 19 92 34 92C49 92 58 82 58 66C58 50 49 40 34 40Z" />
          <path transform="translate(283 0)" d="M0 32H11L33 87L54 32H65L35 109C30 122 24 128 13 128H5V118H13C20 118 24 113 28 102L28.5 100Z" />
        </g>
      )}
    </svg>
  );
}
