import { SearchConfig, JobListing, CandidateProfile } from '../types/index.js';
import { LinkedInScraper } from './linkedin.js';
import { NaukriScraper } from './naukri.js';
import { IndeedScraper } from './indeed.js';
import { WellfoundScraper } from './wellfound.js';
import { InstahyreScraper } from './instahyre.js';
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
    role?: string;
    location?: string;
    timeFilter?: string;
    enableAIAnalysis?: boolean;
    maxPerPlatform?: number;
  }): Promise<JobListing[]> {
    const targetPlatforms = options?.platforms && options.platforms.length > 0
      ? options.platforms
      : ['linkedin', 'naukri', 'indeed', 'wellfound', 'instahyre'];

    const role = options?.role || this.config.targetRoles[0]; // e.g., 'DevOps Engineer'
    const location = options?.location || 'India';
    const enableAI = options?.enableAIAnalysis ?? true;
    const timeFilter = options?.timeFilter || 'week';

    console.log(`\n🚀 Starting Job Hunter Scan`);
    console.log(`Role: ${role} | Location: ${location} | Time Filter: ${timeFilter}`);
    console.log(`Platforms: ${targetPlatforms.join(', ')}\n`);

    const allFound: JobListing[] = [];

    for (const platName of targetPlatforms) {
      const scraper = this.getScraper(platName);
      if (!scraper) {
        console.warn(`[Skip] Platform ${platName} not supported yet.`);
        continue;
      }

      try {
        console.log(`\n--- Scanning ${platName.toUpperCase()} ---`);
        const jobs = await scraper.searchJobs(role, location, timeFilter);
        console.log(`Found ${jobs.length} raw jobs on ${platName}`);

        allFound.push(...jobs);
      } catch (err: any) {
        console.error(`Error scanning ${platName}:`, err.message);
      }
    }

    console.log(`\nTotal jobs scraped across all platforms: ${allFound.length}`);

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

    // Keyword filtering & scoring
    for (const job of deduplicated) {
      this.evaluateKeywords(job);
    }

    // Sort by preliminary matched keywords count
    deduplicated.sort((a, b) => ((b.matchedKeywords?.length || 0) - (a.matchedKeywords?.length || 0)));

    // AI Deep Analysis on top jobs
    if (enableAI && deduplicated.length > 0) {
      const topJobs = deduplicated.slice(0, 8); // Analyze top 8 matching jobs with Gemini
      console.log(`\n🤖 Running Gemini Deep Analysis on top ${topJobs.length} matching jobs...`);

      for (let i = 0; i < topJobs.length; i++) {
        const job = topJobs[i];
        console.log(`[${i + 1}/${topJobs.length}] Analyzing: ${job.title} at ${job.company}`);

        try {
          const textToAnalyze = job.description || `${job.title} at ${job.company}. Required skills: DevOps, AWS, Kubernetes, Terraform, CI/CD, Observability, SRE. Experience: 0-2 years.`;
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
          job.matchedKeywords = Array.from(new Set([...(job.matchedKeywords || []), ...analysis.matchedKeywords]));
          job.missingKeywords = analysis.missingKeywords;
          job.analysisSummary = analysis.jdSummary;
          job.notes = analysis.resumeTweaks.join(' | ');

          console.log(`   -> Match Score: ${job.matchScore}% | ${job.recommendation}`);
        } catch (err: any) {
          console.warn(`   -> Gemini analysis note: ${err.message}`);
        }
      }
    }

    return deduplicated;
  }

  private evaluateKeywords(job: JobListing): void {
    const text = `${job.title} ${job.company} ${job.description || ''}`.toLowerCase();
    const matched: string[] = [];
    const missing: string[] = [];

    for (const kw of this.config.keywords) {
      // Normalize keyword (remove parentheses content for simple text matching)
      const cleanKw = kw.toLowerCase().replace(/\([^)]*\)/g, '').trim();
      if (cleanKw.length > 2 && text.includes(cleanKw)) {
        matched.push(kw);
      }
    }

    job.matchedKeywords = matched;
    job.missingKeywords = missing;

    if (!job.matchScore) {
      // Simple initial score based on keyword density
      const score = Math.min(95, Math.round(50 + (matched.length / 5) * 20));
      job.matchScore = score;
      job.recommendation = score >= 80 ? 'HIGHLY_RECOMMENDED' : score >= 65 ? 'GOOD_MATCH' : 'WEAK_MATCH';
    }
  }
}

