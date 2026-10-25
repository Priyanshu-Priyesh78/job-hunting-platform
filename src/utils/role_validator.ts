/**
 * Strict role relevance and seniority validator for Priyanshu Priyesh.
 * Target profile: SRE / DevOps / Cloud Engineer / Platform Engineer (0-3 years experience).
 */

const FORBIDDEN_TITLE_TERMS = [
  'hardware',
  'data center',
  'datacenter',
  'dcim',
  'enterprise systems developer',
  'enterprise systems',
  'business systems',
  'order to cash',
  'sap',
  'erp',
  'salesforce',
  'browser isolation',
  'network protocols',
  'telecom',
  'radio',
  'embedded',
  'firmware',
  'desktop',
  'helpdesk',
  'it support',
  'desktop support',
  'field engineer',
  'dc technician',
  'test',
  'sdet',
  'qa',
  'quality assurance',
  'test engineer',
  'performance engineer',
  'engineering manager',
  'manager',
  'product engineer',
  'product manager',
  'product management',
  'forward deployed',
  'solutions architect',
  'pre-sales',
  'sales engineer',
  'account executive',
  'frontend',
  'front-end',
  'front end',
  'ui/ux',
  'react',
  'angular',
  'vue',
  'android',
  'ios',
  'mobile',
  'flutter',
  'react native',
  'co-founder',
  'equity only',
  'chief',
  'cto',
  'ceo',
  'vp',
  'vice president',
  'director',
  'head of',
  'data analyst',
  'data scientist',
  'machine learning',
  'ai engineer',
  'applied ai',
  'bi analyst',
  'sales',
  'marketing',
  'recruiter',
  'recruiting',
  'talent',
  'legal',
  'finance',
  'fpa',
  'counsel'
];

const ALLOWED_CORE_INFRA_TERMS = [
  'devops',
  'sre',
  'site reliability',
  'cloud engineer',
  'cloud platform',
  'cloud infrastructure',
  'cloud operations',
  'cloud ops',
  'platform engineer',
  'platform reliability',
  'infrastructure engineer',
  'infra engineer',
  'kubernetes',
  'k8s',
  'gitops'
];

export interface RoleValidationResult {
  isRelevant: boolean;
  isSeniorMismatch: boolean;
  reason?: string;
}

export function validateRoleRelevance(title: string = '', textContent: string = ''): RoleValidationResult {
  const titleLower = title.toLowerCase().replace(/\s+/g, ' ').trim();
  const textLower = `${title} ${textContent}`.toLowerCase();

  // 1. Check for strictly forbidden non-infra terms in title
  for (const term of FORBIDDEN_TITLE_TERMS) {
    if (titleLower.includes(term)) {
      return {
        isRelevant: false,
        isSeniorMismatch: false,
        reason: `Title contains irrelevant non-infra domain term: "${term}"`
      };
    }
  }

  // 2. Check if title matches core DevOps / SRE / Cloud / Platform engineering
  const matchesCoreInfra = ALLOWED_CORE_INFRA_TERMS.some((term) => titleLower.includes(term));
  if (!matchesCoreInfra) {
    // Check if it's a Linux systems engineer specifically (and not generic systems)
    const isLinuxInfra = titleLower.includes('linux systems') || titleLower.includes('production engineer');
    if (!isLinuxInfra) {
      return {
        isRelevant: false,
        isSeniorMismatch: false,
        reason: `Role title does not match core target roles (DevOps, SRE, Cloud, Platform Engineer)`
      };
    }
  }

  // 3. Check for Seniority Mismatch (4+ or 5+ years, Lead, Staff, Principal, Director)
  const isSeniorTitle = /\b(senior|sr\.|sr|lead|staff|principal|director|head of|vp|architect)\b/i.test(titleLower) &&
    !titleLower.includes('junior') && !titleLower.includes('associate');

  const highExpMatch = textLower.match(/\b([4-9]|1[0-5])\+?\s*(?:to|-)\s*(\d+)?\s*(?:years?|yrs?)/i) ||
    textLower.match(/\b([4-9]|1[0-5])\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/i);

  if (isSeniorTitle || highExpMatch) {
    return {
      isRelevant: true,
      isSeniorMismatch: true,
      reason: highExpMatch ? `Demands ${highExpMatch[0]} experience` : 'Senior/Staff/Lead level title'
    };
  }

  return {
    isRelevant: true,
    isSeniorMismatch: false
  };
}
