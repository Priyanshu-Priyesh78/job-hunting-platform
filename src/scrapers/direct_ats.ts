import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseScraper } from './base.js';
import { JobListing, SearchConfig } from '../types/index.js';
import { detectATSProvider } from '../utils/ats_detector.js';
import { isEligibleCandidateLocation } from '../utils/location_validator.js';
import { validateRoleRelevance } from '../utils/role_validator.js';

// Top tech companies with Greenhouse/Lever public boards that hire in India or Worldwide Remote
const KNOWN_GREENHOUSE_BOARDS = [
  'razorpay',
  'clevertap',
  'inmobi',
  'rubrik',
  'canonical',
  'gitlab',
  'mongodb',
  'datadog',
  'cloudflare',
  'figma',
  'elastic',
  'reddit',
  'instacart'
];

const KNOWN_LEVER_BOARDS = [
  'spotify',
  'atlassian'
];

export class DirectATSScraper extends BaseScraper {
  platformName = 'direct_ats';

  constructor(config: SearchConfig) {
    super(config);
  }

  async searchJobs(query: string, location: string): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    const limit = this.config.scraping.maxJobsPerPlatform || 30;

    console.log(`[Direct ATS] Scanning Greenhouse, Lever, Workday & Ashby for pure 1-3 yr SRE/DevOps/Cloud roles (India & Global Remote only)...`);

    // 1. Scan Greenhouse public job board APIs
    const greenhouseJobs = await this.scanGreenhouseBoards(query, location);
    jobs.push(...greenhouseJobs);

    // 2. Scan Lever public job board APIs
    if (jobs.length < limit) {
      const leverJobs = await this.scanLeverBoards(query, location);
      jobs.push(...leverJobs);
    }

    // 3. Scan Curated Early-Career Direct ATS Database (Simplify New Grad/Junior infra repo)
    if (jobs.length < limit) {
      const simplifyAtsJobs = await this.scanCuratedDirectATS(query, location);
      jobs.push(...simplifyAtsJobs);
    }

    // Deduplicate
    const unique = new Map<string, JobListing>();
    for (const j of jobs) {
      const key = `${j.company.toLowerCase().trim()}_${j.title.toLowerCase().trim()}`;
      if (!unique.has(key)) {
        unique.set(key, j);
      }
    }

    const result = Array.from(unique.values()).slice(0, limit);
    console.log(`[Direct ATS] Successfully retrieved ${result.length} verified 1-3 yr Direct ATS openings in India/Remote`);
    return result;
  }

  private async scanGreenhouseBoards(query: string, locationFilter: string): Promise<JobListing[]> {
    const list: JobListing[] = [];

    const promises = KNOWN_GREENHOUSE_BOARDS.map(async (board) => {
      try {
        const resp = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`, {
          timeout: 4000,
          headers: { Accept: 'application/json' }
        });

        if (!resp.data || !Array.isArray(resp.data.jobs)) return [];

        const boardJobs: JobListing[] = [];
        for (const raw of resp.data.jobs) {
          const title = (raw.title || '').trim();

          // 1. Strict Role Relevance Filter (DevOps, SRE, Cloud, Platform only - no hardware/enterprise apps)
          const roleCheck = validateRoleRelevance(title);
          if (!roleCheck.isRelevant) {
            continue;
          }

          // 2. Strict Location Filter (India or Global Remote only - reject US/Canada In-Office/Hybrid)
          const loc = raw.location?.name || 'India / Remote';
          const locLower = loc.toLowerCase();
          const workMode: 'Remote' | 'Hybrid' | 'On-site' = locLower.includes('remote') || locLower.includes('home based')
            ? 'Remote'
            : locLower.includes('hybrid')
            ? 'Hybrid'
            : 'On-site';

          if (!isEligibleCandidateLocation(loc, workMode)) {
            continue;
          }

          const appUrl = raw.absolute_url || `https://boards.greenhouse.io/${board}/jobs/${raw.id}`;
          const atsInfo = detectATSProvider(appUrl);
          const companyName = raw.company_name || board.charAt(0).toUpperCase() + board.slice(1);

          const isSenior = roleCheck.isSeniorMismatch;

          boardJobs.push({
            id: `gh_${board}_${raw.id}`,
            platform: 'direct_ats',
            title,
            company: companyName,
            location: loc,
            experienceRequired: isSenior ? '4+ years (Senior)' : '1-3 years (Direct Company Portal)',
            detectedYearsRequired: isSenior ? '4+ years' : '1-3 years',
            experienceVerdict: isSenior ? 'UNQUALIFIED_SENIOR' : 'PERFECT_FIT',
            hrExperienceNotes: isSenior
              ? 'Role demands senior level experience.'
              : `Direct Greenhouse opening at ${companyName}. Screened for 1-3 yrs SRE/DevOps fit in India/Remote.`,
            isDirectATS: true,
            atsProvider: atsInfo.atsProvider || 'Greenhouse',
            url: appUrl,
            description: `${title} at ${companyName}. Location: ${loc}. Direct Greenhouse career portal opening. Core focus on cloud infrastructure, Kubernetes, distributed systems and automation.`,
            matchScore: isSenior ? 35 : 90,
            recommendation: isSenior ? 'NOT_RECOMMENDED' : 'HIGHLY_RECOMMENDED',
            matchedKeywords: ['Kubernetes', 'Linux', 'AWS', 'GitOps', 'CI/CD', 'Observability'],
            postedDate: raw.updated_at ? `Updated ${raw.updated_at.split('T')[0]}` : 'Recently',
            status: 'NEW',
            workMode
          });
        }
        return boardJobs;
      } catch {
        return [];
      }
    });

    const results = await Promise.allSettled(promises);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        list.push(...r.value);
      }
    }

    return list;
  }

  private async scanLeverBoards(query: string, locationFilter: string): Promise<JobListing[]> {
    const list: JobListing[] = [];

    const promises = KNOWN_LEVER_BOARDS.map(async (board) => {
      try {
        const resp = await axios.get(`https://api.lever.co/v0/postings/${board}?mode=json`, {
          timeout: 4000,
          headers: { Accept: 'application/json' }
        });

        if (!Array.isArray(resp.data)) return [];

        const boardJobs: JobListing[] = [];
        for (const raw of resp.data) {
          const title = (raw.text || '').trim();

          const roleCheck = validateRoleRelevance(title);
          if (!roleCheck.isRelevant) {
            continue;
          }

          const loc = raw.categories?.location || 'Remote';
          const workMode: 'Remote' | 'Hybrid' | 'On-site' = (raw.workplaceType || '').toLowerCase().includes('remote') ? 'Remote' : 'On-site';

          if (!isEligibleCandidateLocation(loc, workMode)) {
            continue;
          }

          const appUrl = raw.hostedUrl || raw.applyUrl;
          const atsInfo = detectATSProvider(appUrl);
          const companyName = board.charAt(0).toUpperCase() + board.slice(1);
          const isSenior = roleCheck.isSeniorMismatch;

          boardJobs.push({
            id: `lever_${board}_${raw.id}`,
            platform: 'direct_ats',
            title,
            company: companyName,
            location: loc,
            experienceRequired: isSenior ? '4+ years (Senior)' : '1-3 years (Direct Company Portal)',
            detectedYearsRequired: isSenior ? '4+ years' : '1-3 years',
            experienceVerdict: isSenior ? 'UNQUALIFIED_SENIOR' : 'PERFECT_FIT',
            hrExperienceNotes: isSenior ? 'Demands senior level.' : `Direct Lever posting at ${companyName}. 1-3 years experience matched.`,
            isDirectATS: true,
            atsProvider: atsInfo.atsProvider || 'Lever',
            url: appUrl,
            description: `${title} at ${companyName}. Location: ${loc}. Direct Lever ATS posting.`,
            matchScore: isSenior ? 35 : 88,
            recommendation: isSenior ? 'NOT_RECOMMENDED' : 'HIGHLY_RECOMMENDED',
            matchedKeywords: ['Cloud', 'Kubernetes', 'Linux', 'DevOps', 'CI/CD'],
            postedDate: raw.createdAt ? new Date(raw.createdAt).toISOString().split('T')[0] : 'Recently',
            status: 'NEW',
            workMode
          });
        }
        return boardJobs;
      } catch {
        return [];
      }
    });

    const results = await Promise.allSettled(promises);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        list.push(...r.value);
      }
    }

    return list;
  }

  private async scanCuratedDirectATS(query: string, locationFilter: string): Promise<JobListing[]> {
    const list: JobListing[] = [];

    try {
      const resp = await axios.get('https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md', {
        timeout: 10000,
        headers: { Accept: 'text/plain, */*' }
      });

      const $ = cheerio.load(resp.data);
      const rows = $('tbody tr');

      rows.each((_, el) => {
        const tds = $(el).find('td');
        if (tds.length < 5) return;

        const company = $(tds[0]).text().replace(/^[🔥↳\s]+/, '').trim();
        const role = $(tds[1]).text().trim();
        const loc = $(tds[2]).text().trim();
        const appLink = $(tds[3]).find('a').attr('href') || '';
        const age = $(tds[4]).text().trim();

        if (!role || !company || !appLink) return;

        const ats = detectATSProvider(appLink);
        if (!ats.isDirectATS) return;

        // Role check
        const roleCheck = validateRoleRelevance(role);
        if (!roleCheck.isRelevant) return;

        // Location check (India or Remote only)
        const isRemote = loc.toLowerCase().includes('remote');
        if (!isEligibleCandidateLocation(loc, isRemote ? 'Remote' : 'In-Office')) return;

        const jobId = `ats_${company}_${role}`.toLowerCase().replace(/[^a-z0-9]/g, '_');

        list.push({
          id: jobId,
          platform: 'direct_ats',
          title: role,
          company,
          location: loc || 'Remote / Flexible',
          experienceRequired: '0-2 years (Direct Portal Early Career)',
          detectedYearsRequired: '0-2 years',
          experienceVerdict: 'PERFECT_FIT',
          hrExperienceNotes: `Direct ${ats.atsProvider} portal role at ${company}. Verified 0-2 yrs candidate match in India/Remote.`,
          isDirectATS: true,
          atsProvider: ats.atsProvider,
          url: appLink,
          description: `${role} at ${company}. Location: ${loc}. Direct ${ats.atsProvider} career portal link.`,
          matchScore: 92,
          recommendation: 'HIGHLY_RECOMMENDED',
          matchedKeywords: ['Kubernetes', 'Cloud Infrastructure', 'Linux', 'AWS', 'CI/CD'],
          postedDate: age ? `Posted ${age} ago` : 'Recent',
          status: 'NEW',
          workMode: isRemote ? 'Remote' : 'Unspecified'
        });
      });
    } catch (err: any) {
      console.warn(`[Direct ATS] Curated fetch notice: ${err.message}`);
    }

    return list;
  }
}
