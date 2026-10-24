import axios from 'axios';
import { BaseScraper } from './base.js';
import { JobListing, SearchConfig } from '../types/index.js';

export class InstahyreScraper extends BaseScraper {
  platformName = 'instahyre';

  constructor(config: SearchConfig) {
    super(config);
  }

  async searchJobs(query: string, location: string): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    const limit = this.config.scraping.maxJobsPerPlatform || 25;

    console.log(`[Instahyre] Querying API for "${query}" (0-2 yrs)...`);

    try {
      // Map query to primary skill keyword for Instahyre
      let skillQuery = query;
      if (query.toLowerCase().includes('site reliability') || query.toLowerCase().includes('sre')) {
        skillQuery = 'SRE';
      } else if (query.toLowerCase().includes('devops')) {
        skillQuery = 'DevOps';
      } else if (query.toLowerCase().includes('cloud')) {
        skillQuery = 'Cloud';
      } else if (query.toLowerCase().includes('kubernetes')) {
        skillQuery = 'Kubernetes';
      }

      const url = `https://www.instahyre.com/api/v1/job_search?skills=${encodeURIComponent(
        skillQuery
      )}&years=1`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*'
        },
        timeout: 10000
      });

      const data = response.data;
      if (data && Array.isArray(data.objects)) {
        for (const item of data.objects) {
          if (jobs.length >= limit) break;

          const title = (item.title || item.candidate_title || '').trim();
          const company = item.employer?.company_name || 'Tech Startup';
          const loc = item.locations || location || 'India';
          const keywords = Array.isArray(item.keywords) ? item.keywords : [];
          const publicUrl = item.public_url || `https://www.instahyre.com${item.resource_uri}`;
          const note = item.employer?.instahyre_note || '';

          if (title && company) {
            const jobId = item.id ? `instahyre_${item.id}` : `instahyre_${title}_${company}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const description = `${title} at ${company} (${loc}). Skills required: ${keywords.join(', ')}. ${note}`;

            jobs.push({
              id: jobId,
              platform: 'instahyre',
              title,
              company,
              location: loc,
              experienceRequired: '0-2 years (Entry Level)',
              detectedYearsRequired: '0-2 years',
              experienceVerdict: 'PERFECT_FIT',
              hrExperienceNotes: `Instahyre 0-2 yrs verified opening. Required skills: ${keywords.slice(0, 5).join(', ')}.`,
              matchedKeywords: keywords,
              postedDate: 'Recent',
              url: publicUrl,
              description,
              status: 'NEW',
              workMode: loc.toLowerCase().includes('remote') || title.toLowerCase().includes('remote') ? 'Remote' : 'Unspecified'
            });
          }
        }
      }

      console.log(`[Instahyre] Found ${jobs.length} jobs via API`);
    } catch (err: any) {
      console.warn(`[Instahyre] API error: ${err.message}`);
    }

    return jobs;
  }
}
