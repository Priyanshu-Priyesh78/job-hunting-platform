/**
 * Utility to identify Direct ATS portals (Greenhouse, Lever, Workday, Ashby, etc.)
 * from application URLs.
 */

export interface ATSDetectionResult {
  isDirectATS: boolean;
  atsProvider: 'Greenhouse' | 'Lever' | 'Workday' | 'Ashby' | 'Workable' | 'SmartRecruiters' | 'iCIMS' | 'BambooHR' | 'Rippling' | 'Direct Company Portal' | string;
}

export function detectATSProvider(url: string = ''): ATSDetectionResult {
  if (!url) {
    return { isDirectATS: false, atsProvider: '' };
  }

  const urlLower = url.toLowerCase();

  if (urlLower.includes('greenhouse.io') || urlLower.includes('grnh.se')) {
    return { isDirectATS: true, atsProvider: 'Greenhouse' };
  }

  if (urlLower.includes('jobs.lever.co') || urlLower.includes('lever.co/')) {
    return { isDirectATS: true, atsProvider: 'Lever' };
  }

  if (urlLower.includes('myworkdayjobs.com') || urlLower.includes('workday.com')) {
    return { isDirectATS: true, atsProvider: 'Workday' };
  }

  if (urlLower.includes('ashbyhq.com')) {
    return { isDirectATS: true, atsProvider: 'Ashby' };
  }

  if (urlLower.includes('workable.com')) {
    return { isDirectATS: true, atsProvider: 'Workable' };
  }

  if (urlLower.includes('smartrecruiters.com')) {
    return { isDirectATS: true, atsProvider: 'SmartRecruiters' };
  }

  if (urlLower.includes('icims.com')) {
    return { isDirectATS: true, atsProvider: 'iCIMS' };
  }

  if (urlLower.includes('bamboohr.com')) {
    return { isDirectATS: true, atsProvider: 'BambooHR' };
  }

  if (urlLower.includes('rippling-ats.com')) {
    return { isDirectATS: true, atsProvider: 'Rippling' };
  }

  // Check if it's a direct company careers link (not linkedin, indeed, naukri, foundit)
  const isAggregator =
    urlLower.includes('linkedin.com') ||
    urlLower.includes('naukri.com') ||
    urlLower.includes('indeed.com') ||
    urlLower.includes('foundit.in') ||
    urlLower.includes('glassdoor.com') ||
    urlLower.includes('hirect.in');

  if (!isAggregator && (urlLower.includes('/careers') || urlLower.includes('/jobs') || urlLower.includes('careers.') || urlLower.includes('jobs.'))) {
    return { isDirectATS: true, atsProvider: 'Direct Company Portal' };
  }

  return { isDirectATS: false, atsProvider: '' };
}

