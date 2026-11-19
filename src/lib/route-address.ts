import type { AddressSuggestion } from './delivery';

// Only whole municipality names share a key. A district or a similar name stays separate.
const citySeparators = new RegExp('[^\\p{L}\\p{N}]', 'gu');
const municipalitySpellings = Object.entries({
  telavivyafo: 'telaviv', telavivjaffa: 'telaviv', telavivyaffo: 'telaviv',
  תלאביב: 'telaviv', תלאביביפו: 'telaviv',
  ירושלים: 'jerusalem', חיפה: 'haifa', נתניה: 'netanya', netania: 'netanya',
  רעננה: 'raanana', הרצליה: 'herzliya', herzlia: 'herzliya',
  רמתגן: 'ramatgan', בתים: 'batyam', חולון: 'holon', אשדוד: 'ashdod',
  אשקלון: 'ashkelon', פתחתקווה: 'petahtikva', petahtiqwa: 'petahtikva',
  ראשוןלציון: 'rishonlezion', rishonletsion: 'rishonlezion',
  בארשבע: 'beersheva', beersheba: 'beersheva',
});
const cityAliases = new Map(municipalitySpellings);

function normalizedText(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(citySeparators, '') || value.trim();
}

/** Group equivalent dispatch city labels without rewriting the customer's address. */
export function deliveryCityKey(city: string): string {
  const key = normalizedText(city);
  return cityAliases.get(key) ?? key;
}

/** Keep a provider's formatted endpoint without appending its city twice. */
export function formatRouteAddress({ address, city }: { address: string; city: string }): string {
  const text = address.trim(), locality = city.trim();
  if (!locality || text.split(',').some(part => deliveryCityKey(part) === deliveryCityKey(locality))) return text;
  return [text, locality].filter(Boolean).join(', ');
}

// Accept a building number only when the rest of the chosen label matches the
// provider's street. A number in the search query or the street name is insufficient.
const houseNumber = String.raw`\p{Nd}+(?:[-/–]\p{Nd}+)?(?:\s?(?:[a-zא-ת]|bis|ter))?`;
const numberFirst = new RegExp(`^(${houseNumber})[ ,]+(.+)$`, 'iu');
const numberLast = new RegExp(`^(.+?)[ ,]+(${houseNumber})$`, 'iu');

/** Recover the numbered postal label staff picked when Details only identifies its street. */
export function selectedNumberedAddress(prediction: AddressSuggestion, details: AddressSuggestion): AddressSuggestion | undefined {
  const street = details.street?.trim();
  const city = details.city.trim();
  const address = prediction.address.trim();
  if (!prediction.lookup_token || !street || !city ||
      deliveryCityKey(prediction.city.split(',')[0]) !== deliveryCityKey(city)) return;
  const streetKey = normalizedText(street);
  const leading = numberFirst.exec(address);
  const trailing = numberLast.exec(address);
  const number = leading && normalizedText(leading[2]) === streetKey ? leading[1]
    : trailing && normalizedText(trailing[1]) === streetKey ? trailing[2] : undefined;
  if (!number || details.house_number?.trim().toLowerCase() === number.toLowerCase()) return;
  // A street centre or a point returned for another number cannot locate this building.
  return { id: prediction.id, address, city, street, house_number: number };
}

/** Search displayed delivery fields, including equivalent spellings of a city. */
export function matchesDeliverySearch(query: string, ...fields: Array<string | number | null | undefined>): boolean {
  const needle = normalizedText(query);
  if (!needle) return true;
  const canonical = cityAliases.get(needle) ?? needle;
  return fields.some(value => {
    if (value == null) return false;
    const raw = normalizedText(String(value));
    if (raw.includes(needle) || raw.includes(canonical)) return true;
    const city = cityAliases.get(raw) ?? raw;
    if (city.includes(canonical)) return true;
    for (const [alias, municipality] of municipalitySpellings) {
      if (municipality === city && alias.includes(needle)) return true;
    }
    return false;
  });
}
