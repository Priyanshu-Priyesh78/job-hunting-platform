import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { JobStore } from '../storage/csv_store.js';
import { GoogleSheetsSync } from '../storage/sheets_sync.js';
import { ScraperManager } from '../scrapers/index.js';
import { GeminiAI } from '../ai/gemini.js';
import { FormAutofiller } from '../autofill/browser_autofill.js';
import { ResumeTailorer } from '../ai/resume_tailorer.js';
import { ResumePdfGenerator, ResumeData } from '../ai/pdf_generator.js';
import { NetworkFinder } from '../ai/network_finder.js';
import { CandidateProfile, SearchConfig } from '../types/index.js';

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), 'public')));

const profilePath = path.resolve(process.cwd(), 'config/profile.json');
const searchConfigPath = path.resolve(process.cwd(), 'config/search_config.json');

const profile: CandidateProfile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const searchConfig: SearchConfig = JSON.parse(fs.readFileSync(searchConfigPath, 'utf8'));

const ai = new GeminiAI();
const store = new JobStore();
const sheetsSync = new GoogleSheetsSync();
const scraperManager = new ScraperManager(searchConfig, profile, ai);
const autofiller = new FormAutofiller(profile, searchConfig, ai);
const resumeTailorer = new ResumeTailorer(profile, ai);
const pdfGenerator = new ResumePdfGenerator(searchConfig);
const networkFinder = new NetworkFinder(profile, ai);

export interface ScanProgress {
  isScanning: boolean;
  percent: number;
  stage: string;
  detail: string;
}

let scanProgress: ScanProgress = {
  isScanning: false,
  percent: 0,
  stage: 'Idle',
  detail: 'Ready to scan'
};

// 1. GET ALL JOBS, STATS & SCAN PROGRESS
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await store.getAllJobs();
    const stats = {
      total: jobs.length,
      new: jobs.filter((j) => !j.status || j.status === 'NEW').length,
      reviewed: jobs.filter((j) => j.status === 'REVIEWED').length,
      applied: jobs.filter((j) => j.status === 'APPLIED').length,
      interview: jobs.filter((j) => j.status === 'INTERVIEW').length,
      rejected: jobs.filter((j) => j.status === 'REJECTED' || j.status === 'NOT_INTERESTED').length,
      highlyRecommended: jobs.filter(
        (j) => j.recommendation === 'HIGHLY_RECOMMENDED' || (j.matchScore || 0) >= 80
      ).length
    };

    res.json({ success: true, jobs, stats, scanProgress });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. SCAN PROGRESS ENDPOINT
app.get('/api/scan/progress', (req, res) => {
  res.json({ success: true, scanProgress });
});

// 3. TRIGGER SCAN (With Live Timeline Progress)
app.post('/api/scan', async (req, res) => {
  if (scanProgress.isScanning) {
    return res.status(409).json({ success: false, message: 'Scan already in progress' });
  }

  const { platforms, role, location, timeFilter, enableAI } = req.body;

  scanProgress = {
    isScanning: true,
    percent: 15,
    stage: 'Initializing Scanners',
    detail: `Preparing query for ${role || 'DevOps Engineer'} (${timeFilter || 'week'})...`
  };

  (async () => {
    try {
      scanProgress.percent = 30;
      scanProgress.stage = 'Scraping Portals';
      scanProgress.detail = `Scanning ${platforms ? platforms.join(', ') : 'all platforms'}...`;

      const jobs = await scraperManager.runScan({
        platforms,
        role: role || searchConfig.targetRoles[0],
        location: location || 'India',
        timeFilter: timeFilter || 'week',
        enableAIAnalysis: enableAI ?? true
      });

      scanProgress.percent = 75;
      scanProgress.stage = 'Filtering & Deduplication';
      scanProgress.detail = `Processing ${jobs.length} candidate jobs and matching keywords...`;

      await store.saveJobs(jobs);

      if (sheetsSync.isConfigured()) {
        scanProgress.percent = 90;
        scanProgress.stage = 'Google Sheets Sync';
        scanProgress.detail = 'Mirroring rows to your Google Spreadsheet...';
        await sheetsSync.syncJobsToSheet(await store.getAllJobs());
      }

      scanProgress.percent = 100;
      scanProgress.stage = 'Completed';
      scanProgress.detail = `Scan finished! Saved ${jobs.length} jobs.`;
    } catch (err: any) {
      scanProgress.stage = 'Error';
      scanProgress.detail = `Error: ${err.message}`;
    } finally {
      setTimeout(() => {
        scanProgress.isScanning = false;
        scanProgress.stage = 'Idle';
        scanProgress.percent = 0;
      }, 7000);
    }
  })();

  res.json({ success: true, message: 'Scan started in background' });
});

// 4. UPDATE JOB STATUS
app.patch('/api/jobs/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const updated = await store.updateJobStatus(id, status, notes);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (sheetsSync.isConfigured()) {
      sheetsSync.syncJobsToSheet(await store.getAllJobs()).catch(() => {});
    }

    res.json({ success: true, message: `Status updated to ${status}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. RESUME TAILORING (Gemini JD Analysis)
app.post('/api/resume/tailor', async (req, res) => {
  try {
    const { title, company, description } = req.body;
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description required' });
    }

    const tailored = await resumeTailorer.tailorResumeForJob({ title, company: company || 'Employer', description });
    res.json({ success: true, tailored });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. GENERATE AND SAVE CUSTOMIZED RESUME PDF
app.post('/api/resume/generate-pdf', async (req, res) => {
  try {
    const { company, resumeHtml, jobId } = req.body;
    if (!company || !resumeHtml) {
      return res.status(400).json({ success: false, message: 'Company and resumeHtml required' });
    }

    const { filename, filePath } = await pdfGenerator.generatePdfFromHtml(company, resumeHtml);

    // Update job notes and tracking with customized resume name
    if (jobId) {
      const note = `Custom Resume: ${filename}`;
      await store.updateJobStatus(jobId, undefined, note);
      if (sheetsSync.isConfigured()) {
        sheetsSync.syncJobsToSheet(await store.getAllJobs()).catch(() => {});
      }
    }

    res.json({
      success: true,
      filename,
      filePath,
      downloadUrl: `/api/resumes/download/${filename}`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. DOWNLOAD GENERATED PDF
app.get('/api/resumes/download/:filename', (req, res) => {
  const filename = path.basename(decodeURIComponent(req.params.filename));
  const filePath = path.resolve(process.cwd(), 'resumes', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Resume PDF not found on server. Please click "Generate & Save PDF" first.');
  }

  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="${filename}"`
  });

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

// 8. NETWORKING, ALUMNI & EMAIL LEADS
app.get('/api/networking/leads', async (req, res) => {
  try {
    const company = (req.query.company as string) || 'Company';
    const jobTitle = (req.query.title as string) || 'DevOps Engineer';

    const leadInfo = await networkFinder.getLeadsAndPitch(company, jobTitle);
    res.json({ success: true, leadInfo });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. SMART AUTOFILL LAUNCH
app.post('/api/autofill', async (req, res) => {
  const { url, resumePath } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, message: 'URL required' });
  }

  autofiller
    .launchAutofillSession(url, resumePath)
    .catch((err) => console.error('Autofill browser error:', err.message));

  res.json({
    success: true,
    message: 'Chrome browser launched with Autofill Assistant! Please review and submit on screen.'
  });
});

// 10. GOOGLE SHEETS SYNC
app.get('/api/sheets/status', (req, res) => {
  res.json({
    configured: sheetsSync.isConfigured(),
    webhookUrl: process.env.GOOGLE_SHEET_WEBHOOK_URL ? 'Configured' : null,
    sheetId: process.env.GOOGLE_SHEET_ID ? 'Configured' : null
  });
});

app.post('/api/sheets/config', (req, res) => {
  try {
    const { webhookUrl, sheetId } = req.body;
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    if (webhookUrl !== undefined) {
      if (envContent.includes('GOOGLE_SHEET_WEBHOOK_URL=')) {
        envContent = envContent.replace(/GOOGLE_SHEET_WEBHOOK_URL=.*/, `GOOGLE_SHEET_WEBHOOK_URL=${webhookUrl}`);
      } else {
        envContent += `\nGOOGLE_SHEET_WEBHOOK_URL=${webhookUrl}`;
      }
      process.env.GOOGLE_SHEET_WEBHOOK_URL = webhookUrl;
    }

    if (sheetId !== undefined) {
      if (envContent.includes('GOOGLE_SHEET_ID=')) {
        envContent = envContent.replace(/GOOGLE_SHEET_ID=.*/, `GOOGLE_SHEET_ID=${sheetId}`);
      } else {
        envContent += `\nGOOGLE_SHEET_ID=${sheetId}`;
      }
      process.env.GOOGLE_SHEET_ID = sheetId;
    }

    fs.writeFileSync(envPath, envContent, 'utf8');
    res.json({ success: true, message: 'Google Sheets configuration updated' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sheets/sync', async (req, res) => {
  try {
    if (!sheetsSync.isConfigured()) {
      return res.status(400).json({ success: false, message: 'Google Sheets not configured' });
    }
    const jobs = await store.getAllJobs();
    const success = await sheetsSync.syncJobsToSheet(jobs);
    res.json({ success, message: success ? 'Synced successfully' : 'Sync failed' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. CANDIDATE PROFILE ENDPOINT
app.get('/api/profile', (req, res) => {
  res.json({ success: true, profile });
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Job Hunting Dashboard Web Server Running!`);
  console.log(`👉 Open: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
