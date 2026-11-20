import type { AddressSuggestion } from './delivery';

// Only whole municipality names share a key. A district or a similar name stays separate.
const citySeparators = new RegExp('[^\\p{L}\\p{N}]', 'gu');
const municipalitySpellings = Object.entries({
  telavivyafo: 'telaviv', telavivjaffa: 'telaviv', telavivyaffo: 'telaviv',
  תלאביב: 'telaviv', תלאביביפו: 'telaviv',
  ירושלים: 'jerusalem', חיפה: 'haifa', נתניה: 'netanya', netania: 'netanya',
  רעננה: 'raanana', הרצליה: 'herzliya', herzlia: 'herzliya', herzlya: 'herzliya', hertzlia: 'herzliya', hertzliya: 'herzliya', herzeliya: 'herzliya', hzrzlya: 'herzliya',
  גבעתשמואל: 'givatshmuel', guivatshmuel: 'givatshmuel',
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

/** Extract the locality from the displayed secondary label when Google Details is unavailable. */
export function predictionLocality(secondary: string): string {
  const first = secondary.split(',')[0].trim();
  return /^(israel|israël|ישראל|france|צרפת)$/i.test(first) ? '' : first;
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

/** Separate an existing house number so it can be reviewed when staff choose a street. */
export function streetBuilding(address: string): { street: string; number: string; first: boolean } | undefined {
  const text = address.trim();
  const leading = numberFirst.exec(text);
  if (leading) return { street: leading[2], number: leading[1], first: true };
  const trailing = numberLast.exec(text);
  if (trailing) return { street: trailing[1], number: trailing[2], first: false };
}

function streetKey(name: string): string {
  return normalizedText(name.replace(/(?:^|\s)(?:street|st\.?|rue|רחוב)(?=\s|$)/gi, ' '));
}

function matchingStreetNumber(address: string, streets: string[]): string {
  const leading = numberFirst.exec(address.trim());
  if (leading && streets.includes(streetKey(leading[2]))) return leading[1];
  const trailing = numberLast.exec(address.trim());
  return trailing && streets.includes(streetKey(trailing[1])) ? trailing[2] : '';
}

/** Compare the complete postal identity before retaining private access instructions. */
export function samePostalBuilding(a: { address: string; city: string }, b: { address: string; city: string }): boolean {
  if (!a.city.trim() || deliveryCityKey(a.city) !== deliveryCityKey(b.city)) return false;
  const left = streetBuilding(a.address), right = streetBuilding(b.address);
  if (!left || !right) return !!a.address.trim() && a.address.trim() === b.address.trim();
  return streetKey(left.street) === streetKey(right.street) &&
    left.number.toLowerCase().replace(/\s/g, '') === right.number.toLowerCase().replace(/\s/g, '');
}

/** Restore the number only when the old and newly chosen street and city match. */
export function numberForSelectedStreet(address: string, city: string, chosen: AddressSuggestion) {
  const locality = deliveryCityKey(chosen.city);
  if (!locality || deliveryCityKey(city) !== locality) return '';
  const streets = [streetKey(chosen.address), streetKey(chosen.street ?? '')].filter(Boolean);
  const direct = matchingStreetNumber(address, streets);
  if (direct) return direct;
  const words = address.trim().split(/\s+/);
  for (let i = 2; i < words.length; i++) {
    if (deliveryCityKey(words.slice(i).join(' ')) === locality) {
      return matchingStreetNumber(words.slice(0, i).join(' '), streets);
    }
  }
  return '';
}

/** Recover the numbered postal label staff picked when Details only identifies its street. */
export function selectedNumberedAddress(prediction: AddressSuggestion, details: AddressSuggestion): AddressSuggestion | undefined {
  const street = details.street?.trim();
  const city = details.city.trim();
  const address = prediction.address.trim();
  if (!prediction.lookup_token || !street || !city ||
      deliveryCityKey(prediction.city.split(',')[0]) !== deliveryCityKey(city)) return;
  const number = matchingStreetNumber(address, [streetKey(street)].filter(Boolean));
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
