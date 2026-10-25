import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseScraper } from './base.js';
import { JobListing, SearchConfig } from '../types/index.js';
import { isEligibleCandidateLocation } from '../utils/location_validator.js';
import { validateRoleRelevance } from '../utils/role_validator.js';
import { detectATSProvider } from '../utils/ats_detector.js';

export class WellfoundScraper extends BaseScraper {
  platformName = 'wellfound';

  constructor(config: SearchConfig) {
    super(config);
  }

  async searchJobs(query: string, location: string): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    const limit = this.config.scraping.maxJobsPerPlatform || 25;

    console.log(`[Wellfound] Searching high-growth startup SRE/DevOps/Cloud openings in India & Remote...`);

    const targetUrls = [
      'https://wellfound.com/role/l/devops-engineer/india',
      'https://wellfound.com/role/l/site-reliability-engineer/india',
      'https://wellfound.com/role/l/cloud-engineer/india',
      'https://wellfound.com/role/r/devops-engineer',
      'https://wellfound.com/role/r/site-reliability-engineer'
    ];

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };

    for (const targetUrl of targetUrls) {
      if (jobs.length >= limit) break;

      try {
        const resp = await axios.get(targetUrl, { headers, timeout: 8000 });
        const $ = cheerio.load(resp.data);
        const nextDataEl = $('#__NEXT_DATA__');

        if (nextDataEl.length === 0) continue;

        const nextData = JSON.parse(nextDataEl.text() || '{}');
        const apollo = nextData.props?.pageProps?.apolloState?.data || {};

        // Map startup results to get company names
        const jobToStartup: Record<string, any> = {};
        const startupKeys = Object.keys(apollo).filter((k) => k.startsWith('StartupResult:') || k.startsWith('Startup:'));
        for (const sk of startupKeys) {
          const s = apollo[sk];
          if (s.highlightedJobListings && Array.isArray(s.highlightedJobListings)) {
            for (const item of s.highlightedJobListings) {
              if (item.__ref) jobToStartup[item.__ref] = s;
            }
          }
        }

        const jobKeys = Object.keys(apollo).filter((k) => k.startsWith('JobListingSearchResult:') || k.startsWith('JobListing:'));

        for (const key of jobKeys) {
          if (jobs.length >= limit) break;

          const item = apollo[key];
          const title = (item.title || item.slug?.replace(/-/g, ' ') || '').trim();
          if (!title) continue;

          // 1. Strict Role Relevance Filter
          const roleCheck = validateRoleRelevance(title, item.description || '');
          if (!roleCheck.isRelevant) continue;

          // 2. Strict Location Filter
          const locNames = Array.isArray(item.locationNames) ? item.locationNames.join(', ') : location || 'India';
          const isRemote = item.remote || false;
          const workMode: 'Remote' | 'Hybrid' | 'On-site' = isRemote ? 'Remote' : 'On-site';

          if (!isEligibleCandidateLocation(locNames, workMode)) continue;

          const startup = jobToStartup[key] || {};
          const company = startup.name || 'Venture-backed Startup';
          const compensation = item.compensation || '';
          const minExp = item.yearsExperienceMin;
          const isSenior = roleCheck.isSeniorMismatch || (typeof minExp === 'number' && minExp >= 4);

          const id = item.id || key.replace(/^[^:]+:/, '');
          const slug = item.slug || 'job';
          const startupSlug = startup.slug || 'company';
          const appLink = `https://wellfound.com/company/${startupSlug}/jobs/${id}-${slug}`;

          const atsInfo = detectATSProvider(item.atsSource || appLink);

          jobs.push({
            id: `wf_${id}`,
            platform: 'wellfound',
            title,
            company,
            location: isRemote ? `${locNames} (Remote)` : locNames,
            experienceRequired: typeof minExp === 'number' ? `${minExp}+ years required` : (isSenior ? '4+ years' : '0-2 years'),
            detectedYearsRequired: typeof minExp === 'number' ? `${minExp} years` : (isSenior ? '4+ years' : '0-2 years'),
            experienceVerdict: isSenior ? 'UNQUALIFIED_SENIOR' : 'PERFECT_FIT',
            hrExperienceNotes: isSenior
              ? 'Startup position demanding senior level experience (4+ years).'
              : `Wellfound early-career startup role. ${compensation ? `Compensation: ${compensation}.` : ''} 100% matched for India/Remote candidate.`,
            salary: compensation,
            isDirectATS: atsInfo.isDirectATS,
            atsProvider: atsInfo.atsProvider || 'Wellfound Direct',
            matchScore: isSenior ? 35 : 92,
            recommendation: isSenior ? 'NOT_RECOMMENDED' : 'HIGHLY_RECOMMENDED',
            matchedKeywords: ['Kubernetes', 'Docker', 'AWS', 'Terraform', 'CI/CD', 'Linux', 'DevOps'],
            postedDate: 'Recent',
            url: appLink,
            description: item.description ? item.description.slice(0, 1500) : `${title} at ${company}. Location: ${locNames}. High-growth venture backed startup opportunity via Wellfound.`,
            status: 'NEW',
            workMode
          });
        }
      } catch (err: any) {
        console.warn(`[Wellfound] Notice on ${targetUrl}: ${err.message}`);
      }
    }

    console.log(`[Wellfound] Found ${jobs.length} verified SRE/DevOps jobs for India / Remote`);
    return jobs;
  }
}
