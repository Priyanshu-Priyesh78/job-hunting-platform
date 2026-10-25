import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import csvParser from 'csv-parser';
import { JobListing } from '../types/index.js';
import { detectATSProvider } from '../utils/ats_detector.js';

const CSV_FILE_PATH = path.resolve(process.cwd(), 'jobs.csv');

const CSV_HEADERS = [
  { id: 'id', title: 'ID' },
  { id: 'platform', title: 'Platform' },
  { id: 'title', title: 'Title' },
  { id: 'company', title: 'Company' },
  { id: 'location', title: 'Location' },
  { id: 'experienceRequired', title: 'Exp Required' },
  { id: 'detectedYearsRequired', title: 'Exp Detected' },
  { id: 'experienceVerdict', title: 'Exp Verdict' },
  { id: 'hrExperienceNotes', title: 'HR Notes' },
  { id: 'matchScore', title: 'Match Score %' },
  { id: 'recommendation', title: 'Recommendation' },
  { id: 'matchedKeywords', title: 'Matched Keywords' },
  { id: 'missingKeywords', title: 'Missing Keywords' },
  { id: 'isDirectATS', title: 'Direct ATS' },
  { id: 'atsProvider', title: 'ATS Provider' },
  { id: 'url', title: 'Application URL' },
  { id: 'status', title: 'Status' },
  { id: 'postedDate', title: 'Date Posted' },
  { id: 'appliedDate', title: 'Date Applied' },
  { id: 'notes', title: 'Notes' },
  { id: 'description', title: 'Description' }
];

export class JobStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || CSV_FILE_PATH;
  }

  async getAllJobs(): Promise<JobListing[]> {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const results: JobListing[] = [];
      fs.createReadStream(this.filePath)
        .pipe(csvParser())
        .on('data', (data) => {
          const rawUrl = data['Application URL'] || data.url || '';
          let isDirect = data['Direct ATS'] === 'true' || data.isDirectATS === 'true' || data.isDirectATS === true;
          let atsProv = data['ATS Provider'] || data.atsProvider || '';

          if (!isDirect && rawUrl) {
            const detected = detectATSProvider(rawUrl);
            if (detected.isDirectATS) {
              isDirect = true;
              atsProv = detected.atsProvider;
            }
          }

          results.push({
            id: data.ID || data.id,
            platform: data.Platform || data.platform || 'unknown',
            title: data.Title || data.title || '',
            company: data.Company || data.company || '',
            location: data.Location || data.location || '',
            experienceRequired: data['Exp Required'] || data.experienceRequired || '',
            detectedYearsRequired: data['Exp Detected'] || data.detectedYearsRequired || '',
            experienceVerdict: data['Exp Verdict'] || data.experienceVerdict || undefined,
            hrExperienceNotes: data['HR Notes'] || data.hrExperienceNotes || '',
            matchScore: data['Match Score %'] ? parseInt(data['Match Score %'], 10) : undefined,
            recommendation: data.Recommendation || data.recommendation,
            matchedKeywords: data['Matched Keywords'] ? data['Matched Keywords'].split(', ') : [],
            missingKeywords: data['Missing Keywords'] ? data['Missing Keywords'].split(', ') : [],
            isDirectATS: isDirect,
            atsProvider: atsProv,
            url: rawUrl,
            status: data.Status || data.status || 'NEW',
            postedDate: data['Date Posted'] || data.postedDate || '',
            appliedDate: data['Date Applied'] || data.appliedDate || '',
            notes: data.Notes || data.notes || '',
            description: data.Description || data.description || ''
          });
        })
        .on('end', () => resolve(results))
        .on('error', (err) => reject(err));
    });
  }

  async saveJobs(newJobs: JobListing[]): Promise<{ added: number; updated: number; total: number }> {
    const existing = await this.getAllJobs();
    const map = new Map<string, JobListing>();

    for (const job of existing) {
      map.set(this.normalizeKey(job), job);
    }

    let added = 0;
    let updated = 0;

    for (const job of newJobs) {
      const key = this.normalizeKey(job);
      if (map.has(key)) {
        // Merge without losing status or appliedDate
        const old = map.get(key)!;
        map.set(key, {
          ...old,
          ...job,
          status: old.status || job.status || 'NEW',
          appliedDate: old.appliedDate || job.appliedDate
        });
        updated++;
      } else {
        map.set(key, job);
        added++;
      }
    }

    const allJobs = Array.from(map.values());
    await this.writeToCsv(allJobs);

    return { added, updated, total: allJobs.length };
  }

  async updateJobStatus(id: string, status: JobListing['status'], notes?: string): Promise<boolean> {
    const jobs = await this.getAllJobs();
    let found = false;

    for (const job of jobs) {
      if (job.id === id || job.url === id) {
        job.status = status;
        if (status === 'APPLIED' && !job.appliedDate) {
          job.appliedDate = new Date().toISOString().split('T')[0];
        }
        if (notes) {
          job.notes = notes;
        }
        found = true;
        break;
      }
    }

    if (found) {
      await this.writeToCsv(jobs);
    }
    return found;
  }

  private normalizeKey(job: JobListing): string {
    if (job.id && job.id.length > 5) return job.id;
    return `${job.title.toLowerCase().trim()}_${job.company.toLowerCase().trim()}`;
  }

  private async writeToCsv(jobs: JobListing[]): Promise<void> {
    const csvWriter = createObjectCsvWriter({
      path: this.filePath,
      header: CSV_HEADERS
    });

    const records = jobs.map((j) => {
      let isDirect = j.isDirectATS;
      let atsProv = j.atsProvider;
      if (isDirect === undefined && j.url) {
        const detected = detectATSProvider(j.url);
        isDirect = detected.isDirectATS;
        atsProv = detected.atsProvider;
      }

      return {
        id: j.id,
        platform: j.platform,
        title: j.title,
        company: j.company,
        location: j.location,
        experienceRequired: j.experienceRequired || '',
        detectedYearsRequired: j.detectedYearsRequired || '',
        experienceVerdict: j.experienceVerdict || '',
        hrExperienceNotes: j.hrExperienceNotes || '',
        matchScore: j.matchScore ?? '',
        recommendation: j.recommendation ?? '',
        matchedKeywords: (j.matchedKeywords || []).join(', '),
        missingKeywords: (j.missingKeywords || []).join(', '),
        isDirectATS: isDirect ? 'true' : 'false',
        atsProvider: atsProv || '',
        url: j.url,
        status: j.status || 'NEW',
        postedDate: j.postedDate || '',
        appliedDate: j.appliedDate || '',
        notes: j.notes || '',
        description: (j.description || '').slice(0, 500)
      };
    });

    await csvWriter.writeRecords(records);
  }
}

