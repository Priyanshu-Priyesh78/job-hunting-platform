export interface JobListing {
  id: string;
  platform: 'linkedin' | 'naukri' | 'indeed' | 'wellfound' | 'instahyre' | 'glassdoor' | 'foundit' | 'hirect' | 'upler' | string;
  title: string;
  company: string;
  location: string;
  experienceRequired: string;
  detectedYearsRequired?: string;
  isExperienceMatch?: boolean;
  experienceVerdict?: 'PERFECT_FIT' | 'JUSTIFIABLE_BY_SCALE' | 'EXPERIENCE_GAP' | 'UNQUALIFIED_SENIOR';
  hrExperienceNotes?: string;
  postedDate?: string;
  url: string;
  description?: string;
  salary?: string;
  workMode?: 'Remote' | 'Hybrid' | 'On-site' | 'Unspecified';
  matchScore?: number;
  matchedKeywords?: string[];
  missingKeywords?: string[];
  analysisSummary?: string;
  recommendation?: 'HIGHLY_RECOMMENDED' | 'GOOD_MATCH' | 'WEAK_MATCH' | 'NOT_RECOMMENDED';
  status?: 'NEW' | 'REVIEWED' | 'APPLYING' | 'APPLIED' | 'REJECTED' | 'INTERVIEW';
  appliedDate?: string;
  notes?: string;
}

export interface CandidateProfile {
  personal: {
    fullName: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    phoneNumberRaw: string;
    linkedin: string;
    github: string;
    currentLocation: string;
    preferredLocations: string[];
    workAuthorization: string;
    noticePeriodDays: number;
    noticePeriodText: string;
    willingToRelocate: boolean;
  };
  headline: string;
  summary: string;
  experienceYears: number;
  experienceLevel: string;
  education: Array<{
    institution: string;
    degree: string;
    fieldOfStudy: string;
    location: string;
    graduationYear: string;
    cgpa?: string;
  }>;
  workExperience: Array<{
    company: string;
    title: string;
    location: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    highlights: string[];
  }>;
  skills: {
    cloud: string[];
    kubernetes: string[];
    iac: string[];
    cicd: string[];
    observability: string[];
    security: string[];
    languages: string[];
  };
  standardAnswers: Record<string, string>;
}

export interface SearchConfig {
  targetRoles: string[];
  experience: {
    minYears: number;
    maxYears: number;
    preferred: string;
  };
  locations: string[];
  keywords: string[];
  platforms: string[];
  chromeExecutablePath: string;
  scraping: {
    headless: boolean;
    delayBetweenRequestsMs: number;
    maxJobsPerPlatform: number;
  };
}

export interface JDAnalysisResult {
  matchScore: number;
  recommendation: 'HIGHLY_RECOMMENDED' | 'GOOD_MATCH' | 'WEAK_MATCH' | 'NOT_RECOMMENDED';
  detectedYearsRequired: string;
  isExperienceMatch: boolean;
  experienceVerdict: 'PERFECT_FIT' | 'JUSTIFIABLE_BY_SCALE' | 'EXPERIENCE_GAP' | 'UNQUALIFIED_SENIOR';
  hrExperienceNotes: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  jdSummary: string;
  resumeTweaks: string[];
  draftCoverLetter: string;
}

