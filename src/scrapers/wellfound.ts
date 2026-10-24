import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseScraper } from './base.js';
import { JobListing, SearchConfig } from '../types/index.js';
import { CredentialsStore } from '../storage/credentials_store.js';

export class WellfoundScraper extends BaseScraper {
  platformName = 'wellfound';
  private credentialsStore = new CredentialsStore();

  constructor(config: SearchConfig) {
    super(config);
  }

  async searchJobs(query: string, location: string): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    const limit = this.config.scraping.maxJobsPerPlatform || 20;

    console.log(`[Wellfound] Searching startup opportunities for "${query}"...`);

    const creds = this.credentialsStore.getPlatformCredentials('wellfound');
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };

    if (creds?.sessionCookie) {
      headers['Cookie'] = `_wellfound_session=${creds.sessionCookie}`;
    }

    try {
      // 1. Fast Next.js __NEXT_DATA__ extraction
      const targetUrls = [
        `https://wellfound.com/jobs`,
        `https://wellfound.com/role/devops-engineer`,
        `https://wellfound.com/role/cloud-engineer`
      ];

      for (const targetUrl of targetUrls) {
        if (jobs.length >= limit) break;

        try {
          const resp = await axios.get(targetUrl, { headers, timeout: 10000 });
          const $ = cheerio.load(resp.data);
          const nextDataEl = $('script[id=__NEXT_DATA__]');

          if (nextDataEl.length > 0) {
            const nextData = JSON.parse(nextDataEl.html() || '{}');
            const apollo = nextData.props?.pageProps?.apolloState?.data || {};

            const jobKeys = Object.keys(apollo).filter((k) => k.startsWith('JobListing:'));

            for (const key of jobKeys) {
              if (jobs.length >= limit) break;

              const item = apollo[key];
              const startupRef = item.startup?.__ref;
              const startup = startupRef ? apollo[startupRef] : {};

              const title = item.title || item.slug?.replace(/-/g, ' ') || 'Software Engineer';
              const company = startup.name || 'Top YC Startup';
              const compensation = item.compensation || '';
              const locNames = Array.isArray(item.locationNames) ? item.locationNames.join(', ') : location || 'Remote';
              const isRemote = item.remote || false;
              const slug = item.slug || '';
              const id = item.id || key.replace('JobListing:', '');

              const link = slug ? `https://wellfound.com/jobs/${id}-${slug}` : `https://wellfound.com/jobs/${id}`;

              // Check relevance
              const queryTerms = query.toLowerCase().split(/\s+/);
              const titleLower = title.toLowerCase();
              const isRelevant = queryTerms.some((t) => titleLower.includes(t)) ||
                titleLower.includes('engineer') || titleLower.includes('devops') || titleLower.includes('platform');

              if (isRelevant) {
                jobs.push({
                  id: `wf_${id}`,
                  platform: 'wellfound',
                  title,
                  company,
                  location: isRemote ? `${locNames} (Remote)` : locNames,
                  experienceRequired: '0-2 years (Startup)',
                  detectedYearsRequired: '0-2 years',
                  experienceVerdict: 'PERFECT_FIT',
                  hrExperienceNotes: `Wellfound high-growth startup role. Comp: ${compensation || 'Market Rate'}.`,
                  salary: compensation,
                  postedDate: 'Recent',
                  url: link,
                  description: `${title} at ${company}. ${compensation ? `Compensation: ${compensation}.` : ''} Location: ${locNames}. High-growth venture backed startup opportunity via Wellfound.`,
                  status: 'NEW',
                  workMode: isRemote ? 'Remote' : 'Unspecified'
                });
              }
            }
          }
        } catch {
          // continue
        }
      }

      console.log(`[Wellfound] Found ${jobs.length} startup jobs`);
    } catch (err: any) {
      console.warn(`[Wellfound] Error: ${err.message}`);
    }

    return jobs;
  }
}
