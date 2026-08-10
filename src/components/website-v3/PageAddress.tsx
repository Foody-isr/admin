/** Displays a public page address that cannot be edited in the current context. */
export function ReadOnlyAddress({ value }: { value: string }) {
  return (
    <div
      data-page-address-readonly
      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700"
    >
      {value}
    </div>
  );
}
