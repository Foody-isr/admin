import FoodyLogo from './FoodyLogo';

/** Shared platform identity; product naming remains secondary to the Foody mark. */
export default function FoodyAdminBrand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="text-center text-fg-primary">
      <div className="flex items-center justify-center gap-3" dir="ltr">
        <FoodyLogo variant="wordmark" width={126} />
        <span className="border-l border-[var(--line)] pl-3 text-base font-medium">Admin</span>
      </div>
      {subtitle && <p className="mt-2 text-xs text-fg-secondary">{subtitle}</p>}
    </div>
  );
}
