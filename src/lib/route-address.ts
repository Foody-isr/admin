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
