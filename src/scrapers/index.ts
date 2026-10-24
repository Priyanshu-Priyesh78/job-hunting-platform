import axios from 'axios';
import * as cheerio from 'cheerio';
import { SearchConfig, JobListing, CandidateProfile } from '../types/index.js';
import { LinkedInScraper } from './linkedin.js';
import { NaukriScraper } from './naukri.js';
import { IndeedScraper } from './indeed.js';
import { WellfoundScraper } from './wellfound.js';
import { InstahyreScraper } from './instahyre.js';
import { SimplifyScraper } from './simplify.js';
import { UplersScraper } from './uplers.js';
import { FounditScraper } from './foundit.js';
import { GlassdoorScraper } from './glassdoor.js';
import { GeminiAI } from '../ai/gemini.js';

export class ScraperManager {
  private config: SearchConfig;
  private profile: CandidateProfile;
  private ai: GeminiAI;

  constructor(config: SearchConfig, profile: CandidateProfile, ai: GeminiAI) {
    this.config = config;
    this.profile = profile;
    this.ai = ai;
  }

  getScraper(platform: string) {
    switch (platform.toLowerCase()) {
      case 'linkedin':
        return new LinkedInScraper(this.config);
      case 'naukri':
        return new NaukriScraper(this.config);
      case 'indeed':
        return new IndeedScraper(this.config);
      case 'wellfound':
        return new WellfoundScraper(this.config);
      case 'instahyre':
        return new InstahyreScraper(this.config);
      case 'simplify':
        return new SimplifyScraper(this.config);
      case 'uplers':
        return new UplersScraper(this.config);
      case 'foundit':
        return new FounditScraper(this.config);
      case 'glassdoor':
        return new GlassdoorScraper(this.config);
      default:
        return null;
    }
  }

  async runScan(options?: {
    platforms?: string[];
    roles?: string[];
    role?: string;
    location?: string;
    timeFilter?: string;
    enableAIAnalysis?: boolean;
    maxPerPlatform?: number;
  }): Promise<JobListing[]> {
    const targetPlatforms = options?.platforms && options.platforms.length > 0
      ? options.platforms
      : ['linkedin', 'naukri', 'indeed', 'wellfound', 'instahyre'];

    // Determine target roles: support array of roles or fallback to config target roles
    const targetRoles = options?.roles && options.roles.length > 0
      ? options.roles
      : options?.role
      ? [options.role]
      : this.config.targetRoles.slice(0, 4); // Default to top 4 core roles (DevOps, SRE, Cloud, Platform)

    const location = options?.location || 'India';
    const enableAI = options?.enableAIAnalysis ?? true;
    const timeFilter = options?.timeFilter || 'week';

    console.log(`\n🚀 Starting Multi-Role Job Hunter Scan`);
    console.log(`Roles: ${targetRoles.join(', ')}`);
    console.log(`Location: ${location} | Time Filter: ${timeFilter}`);
    console.log(`Platforms: ${targetPlatforms.join(', ')}\n`);

    const allFound: JobListing[] = [];

    for (const role of targetRoles) {
      console.log(`\n========================================`);
      console.log(`🔍 Scanning for Role: "${role}"`);
      console.log(`========================================`);

      for (const platName of targetPlatforms) {
        const scraper = this.getScraper(platName);
        if (!scraper) {
          continue;
        }

        try {
          console.log(`[${platName.toUpperCase()}] Searching for "${role}"...`);
          const jobs = await scraper.searchJobs(role, location, timeFilter);
          console.log(`Found ${jobs.length} jobs on ${platName} for "${role}"`);

          allFound.push(...jobs);
        } catch (err: any) {
          console.error(`Error scanning ${platName} for ${role}:`, err.message);
        }
      }
    }

    console.log(`\nTotal jobs scraped across all roles & platforms: ${allFound.length}`);

    // Deduplicate
    const uniqueMap = new Map<string, JobListing>();
    for (const j of allFound) {
      const key = `${j.title.toLowerCase().trim()}_${j.company.toLowerCase().trim()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, j);
      }
    }
    const deduplicated = Array.from(uniqueMap.values());
    console.log(`Unique jobs after deduplication: ${deduplicated.length}`);

    // Keyword filtering & initial experience heuristics
    for (const job of deduplicated) {
      this.evaluateKeywordsAndSeniority(job);
    }

    // Sort by:
    // 1. Matched experience fit (PERFECT_FIT and JUSTIFIABLE_BY_SCALE first)
    // 2. Preliminary matched keywords count
    deduplicated.sort((a, b) => {
      const aIsSenior = a.experienceVerdict === 'UNQUALIFIED_SENIOR' ? 1 : 0;
      const bIsSenior = b.experienceVerdict === 'UNQUALIFIED_SENIOR' ? 1 : 0;
      if (aIsSenior !== bIsSenior) return aIsSenior - bIsSenior; // non-seniors first
      return ((b.matchedKeywords?.length || 0) - (a.matchedKeywords?.length || 0));
    });

    // AI Deep Analysis on candidate jobs with Gemini (Enterprise ATS & HR persona)
    if (enableAI && deduplicated.length > 0) {
      // Prioritize top jobs that aren't already flagged as senior mismatch
      const candidatesForAI = deduplicated.filter(j => j.experienceVerdict !== 'UNQUALIFIED_SENIOR').slice(0, 15);
      // Also analyze 2 senior ones if needed to verify
      const seniorCandidates = deduplicated.filter(j => j.experienceVerdict === 'UNQUALIFIED_SENIOR').slice(0, 2);
      const topJobs = [...candidatesForAI, ...seniorCandidates];

      console.log(`\n🤖 Running Enterprise ATS & HR Recruiter Analysis on top ${topJobs.length} jobs...`);

      for (let i = 0; i < topJobs.length; i++) {
        const job = topJobs[i];
        console.log(`[${i + 1}/${topJobs.length}] Recruiter Audit: ${job.title} at ${job.company}`);

        try {
          // If description is missing or brief, visit the live page HTML directly
          if (!job.description || job.description.length < 150) {
            console.log(`   🌐 Visiting live ${job.platform.toUpperCase()} URL to audit full requirements...`);
            const liveHtmlDesc = await this.fetchLiveJobDescription(job.url, job.platform);
            if (liveHtmlDesc && liveHtmlDesc.length > 50) {
              job.description = liveHtmlDesc;
            }
          }

          const textToAnalyze = job.description || `${job.title} at ${job.company}. Location: ${job.location || 'India'}.`;
          const analysis = await this.ai.analyzeJobDescription(
            {
              title: job.title,
              company: job.company,
              description: textToAnalyze,
              location: job.location
            },
            this.profile,
            this.config.keywords
          );

          job.matchScore = analysis.matchScore;
          job.recommendation = analysis.recommendation;
          job.detectedYearsRequired = analysis.detectedYearsRequired;
          job.isExperienceMatch = analysis.isExperienceMatch;
          job.experienceVerdict = analysis.experienceVerdict;
          job.hrExperienceNotes = analysis.hrExperienceNotes;
          job.matchedKeywords = Array.from(new Set([...(job.matchedKeywords || []), ...analysis.matchedKeywords]));
          job.missingKeywords = analysis.missingKeywords;
          job.analysisSummary = analysis.jdSummary;
          job.notes = analysis.resumeTweaks.join(' | ');

          console.log(`   -> Verdict: ${job.experienceVerdict} (${job.detectedYearsRequired}) | Score: ${job.matchScore}%`);
          if (job.hrExperienceNotes) {
            console.log(`   -> HR Note: ${job.hrExperienceNotes}`);
          }
        } catch (err: any) {
          console.warn(`   -> Recruiter analysis notice: ${err.message}`);
        }
      }
    }

    return deduplicated;
  }

  private evaluateKeywordsAndSeniority(job: JobListing): void {
    const titleLower = job.title.toLowerCase();
    const text = `${job.title} ${job.company} ${job.description || ''}`.toLowerCase();
    const matched: string[] = [];
    const missing: string[] = [];

    // Check for strict senior / lead / staff titles
    const isSeniorTitle = /\b(senior|sr\.|sr|lead|staff|principal|director|head of|vp|architect)\b/i.test(titleLower) &&
      !titleLower.includes('junior') && !titleLower.includes('associate');

    // Check for high experience mentions in text (5+ to 12+ years)
    const highExpMatch = text.match(/\b([5-9]|1[0-5])\+?\s*(?:to|-)\s*(\d+)?\s*(?:years?|yrs?)/i) ||
      text.match(/\b([5-9]|1[0-5])\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/i);

    if (isSeniorTitle || highExpMatch) {
      job.detectedYearsRequired = highExpMatch ? highExpMatch[0] : '5+ years (Senior Level)';
      job.experienceVerdict = 'UNQUALIFIED_SENIOR';
      job.isExperienceMatch = false;
      job.hrExperienceNotes = 'Role specifies Senior/Lead/Staff level demanding 5+ years of experience. Flagged as experience mismatch.';
      job.matchScore = 35;
      job.recommendation = 'NOT_RECOMMENDED';
    } else {
      // Check for junior / 0-3 years mentions
      const juniorMatch = text.match(/\b(0|1|2|3)\s*(?:to|-)\s*(2|3|4)\s*(?:years?|yrs?)/i) ||
        text.match(/\b(0|1|2)\+?\s*(?:years?|yrs?)/i) ||
        titleLower.includes('junior') || titleLower.includes('associate') || titleLower.includes('entry');

      if (juniorMatch) {
        job.detectedYearsRequired = typeof juniorMatch === 'object' && juniorMatch[0] ? juniorMatch[0] : '0-2 years';
        job.experienceVerdict = 'PERFECT_FIT';
        job.isExperienceMatch = true;
        job.hrExperienceNotes = 'Matches 0-2 years junior/associate requirements. Priyanshu is strongly competitive.';
      } else {
        job.detectedYearsRequired = '1-3 years (Mid/Associate)';
        job.experienceVerdict = 'JUSTIFIABLE_BY_SCALE';
        job.isExperienceMatch = true;
        job.hrExperienceNotes = 'Justifiable by Priyanshu\'s 14+ production EKS clusters across 7 AWS regions.';
      }
    }

    for (const kw of this.config.keywords) {
      const cleanKw = kw.toLowerCase().replace(/\([^)]*\)/g, '').trim();
      if (cleanKw.length > 2 && text.includes(cleanKw)) {
        matched.push(kw);
      }
    }

    job.matchedKeywords = matched;
    job.missingKeywords = missing;

    if (!job.matchScore && job.experienceVerdict !== 'UNQUALIFIED_SENIOR') {
      const score = Math.min(95, Math.round(55 + (matched.length / 5) * 18));
      job.matchScore = score;
      job.recommendation = score >= 80 ? 'HIGHLY_RECOMMENDED' : score >= 65 ? 'GOOD_MATCH' : 'WEAK_MATCH';
    }
  }

  async fetchLiveJobDescription(url: string, platform?: string): Promise<string> {
    if (!url || !url.startsWith('http')) return '';

    try {
      if (platform === 'linkedin') {
        const liScraper = new LinkedInScraper(this.config);
        return await liScraper.fetchJobDescription(url);
      }

      const resp = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 8000
      });

      const $ = cheerio.load(resp.data);
      const mainText = $('article, main, .job-description, .description, #job-description, .posting-requirements, .content').text().replace(/\s+/g, ' ').trim() ||
        $('body').text().replace(/\s+/g, ' ').trim();

      return mainText.slice(0, 4500);
    } catch {
      return '';
    }
  }
}

