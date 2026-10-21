/** Keep a provider's formatted endpoint without appending its city twice. */
export function formatRouteAddress({ address, city }: { address: string; city: string }): string {
  const text = address.trim(), locality = city.trim();
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[’'`]/g, '').trim();
  if (!locality || text.split(',').some(part => normalize(part) === normalize(locality))) return text;
  return [text, locality].filter(Boolean).join(', ');
}
