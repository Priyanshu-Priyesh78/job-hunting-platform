/**
 * Strict location validator for Candidate (Priyanshu Priyesh).
 * Candidate is based in India and is eligible ONLY for:
 * 1. Roles based in India (any Indian tech city, hybrid or in-office in India, or India Remote).
 * 2. Truly Worldwide / Global Remote roles.
 *
 * STRICTLY REJECTS:
 * - In-Office or Hybrid roles outside India (US, UK, Canada, Europe, etc.)
 * - Remote roles restricted to non-India countries (e.g. "US Only", "Canada Only", "EMEA Only").
 */

const INDIA_CITIES_AND_REGIONS = [
  'india',
  'bengaluru',
  'bangalore',
  'hyderabad',
  'pune',
  'gurgaon',
  'gurugram',
  'noida',
  'delhi',
  'mumbai',
  'chennai',
  'kolkata',
  'ahmedabad',
  'indore',
  'kochi',
  'bhopal',
  'jaipur',
  'chandigarh',
  'coimbatore',
  'kerala',
  'tamil nadu',
  'karnataka',
  'maharashtra',
  'telangana',
  'haryana',
  'uttar pradesh',
  'punjab',
  'bhubaneswar',
  'mysore',
  'nagpur',
  'trivandrum',
  'thiruvananthapuram',
  'vadodara',
  'surat'
];

const FOREIGN_RESTRICTED_TERMS = [
  'united states',
  'us only',
  ', us',
  ' u.s.',
  'usa',
  'canada',
  'toronto',
  'vancouver',
  'united kingdom',
  'london',
  'uk only',
  'germany',
  'berlin',
  'austria',
  'switzerland',
  'netherlands',
  'amsterdam',
  'australia',
  'sydney',
  'melbourne',
  'singapore',
  'dubai',
  'israel',
  'san francisco',
  'new york',
  'austin',
  'atlanta',
  'denver',
  'seattle',
  'chicago',
  'miami',
  'los angeles',
  'dallas',
  'boston',
  'california',
  'texas',
  'washington dc',
  'emea',
  'latam'
];

export function isEligibleCandidateLocation(location: string = '', workMode?: string): boolean {
  if (!location) {
    // If unspecified but workMode is Remote, give benefit of doubt
    return workMode === 'Remote';
  }

  const locLower = location.toLowerCase().replace(/\s+/g, ' ').trim();

  // 1. Check if explicitly in India
  const isIndia = INDIA_CITIES_AND_REGIONS.some((term) => locLower.includes(term));
  if (isIndia) {
    return true;
  }

  // 2. Check if it has a strict foreign restricted term
  const hasForeignTerm = FOREIGN_RESTRICTED_TERMS.some((term) => locLower.includes(term));

  // If workMode is In-Office or Hybrid and not in India, reject immediately!
  const modeLower = (workMode || '').toLowerCase();
  const isInOfficeOrHybrid = modeLower.includes('in-office') || modeLower.includes('hybrid') || modeLower.includes('onsite') || modeLower.includes('on-site');
  if (isInOfficeOrHybrid && !isIndia) {
    return false;
  }

  // 3. Check for Global / Worldwide Remote
  const isWorldwideRemote =
    locLower.includes('worldwide') ||
    locLower.includes('anywhere') ||
    locLower.includes('global') ||
    locLower.includes('home based - worldwide') ||
    locLower.includes('apac') ||
    locLower.includes('all locations');

  if (isWorldwideRemote && !locLower.includes('us only') && !locLower.includes('canada only')) {
    return true;
  }

  // If it's just "Remote" or "Remote / Flexible" without foreign restrictions
  if (locLower === 'remote' || locLower === 'remote / flexible' || locLower.startsWith('remote -') || locLower.includes('(remote)')) {
    if (!hasForeignTerm) {
      return true;
    }
  }

  // If it has a foreign term and is not India or Worldwide Remote, reject
  if (hasForeignTerm) {
    return false;
  }

  // Fallback: if location isn't recognized and not India, reject to keep pipeline pure
  return false;
}
