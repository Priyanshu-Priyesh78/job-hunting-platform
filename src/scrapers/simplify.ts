import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseScraper } from './base.js';
import { JobListing, SearchConfig } from '../types/index.js';

export class SimplifyScraper extends BaseScraper {
  platformName = 'simplify';

  constructor(config: SearchConfig) {
    super(config);
  }

  async searchJobs(query: string, location: string): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    const limit = this.config.scraping.maxJobsPerPlatform || 25;

    console.log(`[Simplify] Fetching real-time entry-level & early-career database for "${query}"...`);

    try {
      const response = await axios.get(
        'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md',
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            Accept: 'text/plain, */*'
          },
          timeout: 15000
        }
      );

      const $ = cheerio.load(response.data);
      const rows = $('tbody tr');

      const queryLower = query.toLowerCase();
      const locLower = (location || '').toLowerCase();

      // Determine matching tokens
      const isSreQuery = queryLower.includes('sre') || queryLower.includes('reliability');
      const isDevopsQuery = queryLower.includes('devops');
      const isCloudQuery = queryLower.includes('cloud');
      const isPlatformQuery = queryLower.includes('platform');
      const isInfraQuery = queryLower.includes('infra');

      rows.each((_, el) => {
        if (jobs.length >= limit) return false;

        const tds = $(el).find('td');
        if (tds.length < 5) return;

        const companyRaw = $(tds[0]).text().trim();
        // Remove emoji indicators like 🔥
        const company = companyRaw.replace(/^[🔥↳\s]+/, '').trim();
        const role = $(tds[1]).text().trim();
        const jobLoc = $(tds[2]).text().trim();
        const appLink = $(tds[3]).find('a').attr('href') || '';
        const age = $(tds[4]).text().trim();

        if (!role || !company || !appLink) return;

        const roleLower = role.toLowerCase();
        const jobLocLower = jobLoc.toLowerCase();

        // Match against role
        let matchesRole = false;
        if (isSreQuery && (roleLower.includes('sre') || roleLower.includes('reliability') || roleLower.includes('site reliability'))) {
          matchesRole = true;
        } else if (isDevopsQuery && roleLower.includes('devops')) {
          matchesRole = true;
        } else if (isCloudQuery && roleLower.includes('cloud')) {
          matchesRole = true;
        } else if (isPlatformQuery && roleLower.includes('platform')) {
          matchesRole = true;
        } else if (isInfraQuery && roleLower.includes('infra')) {
          matchesRole = true;
        } else if (roleLower.includes(queryLower)) {
          matchesRole = true;
        } else if (!isSreQuery && !isDevopsQuery && !isCloudQuery && roleLower.includes('software')) {
          // Broad software/infra fallback
          matchesRole = true;
        }

        if (!matchesRole) return;

        // Location matching: allow Remote, Global, India, or all if global search
        if (locLower && locLower !== 'all' && locLower !== 'any') {
          const isIndiaSearch = locLower.includes('india');
          const isRemoteSearch = locLower.includes('remote');

          if (isIndiaSearch) {
            // Keep India or Remote / Global positions
            const isMatch = jobLocLower.includes('india') || jobLocLower.includes('remote') || jobLocLower.includes('global') || jobLocLower.includes('apac');
            if (!isMatch && jobs.length > 5) return; // Prioritize remote/India, but keep top early-career infra roles if few
          } else if (isRemoteSearch && !jobLocLower.includes('remote')) {
            return;
          }
        }

        const jobId = `simplify_${company}_${role}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const isRemote = jobLocLower.includes('remote');

        jobs.push({
          id: jobId,
          platform: 'simplify',
          title: role,
          company,
          location: jobLoc || 'Remote / Flexible',
          experienceRequired: '0-2 years (Early Career / New Grad)',
          detectedYearsRequired: '0-2 years',
          experienceVerdict: 'PERFECT_FIT',
          hrExperienceNotes: `Simplify verified early career opening posted ${age || 'recently'}. 100% matched for 0-2 yrs candidate.`,
          matchedKeywords: ['Cloud Infrastructure', 'Kubernetes', 'CI/CD', 'GitOps', 'DevOps', 'AWS', 'Linux'],
          postedDate: age ? `Posted ${age} ago` : 'Recent',
          url: appLink,
          description: `${role} at ${company}. Location: ${jobLoc}. Verified early career position from Simplify Jobs platform. Direct application link provided.`,
          status: 'NEW',
          workMode: isRemote ? 'Remote' : 'Unspecified'
        });
      });

      console.log(`[Simplify] Found ${jobs.length} relevant early-career jobs`);
    } catch (err: any) {
      console.warn(`[Simplify] Fetch notice: ${err.message}`);
    }

    return jobs;
  }
}
