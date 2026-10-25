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
import { ResumePdfGenerator } from '../ai/pdf_generator.js';
import { NetworkFinder } from '../ai/network_finder.js';
import { CredentialsStore } from '../storage/credentials_store.js';
import { getIngestBookmarkletScript } from '../autofill/ingest_bookmarklet.js';
import { detectATSProvider } from '../utils/ats_detector.js';
import { CandidateProfile, SearchConfig, JobListing } from '../types/index.js';

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
const credentialsStore = new CredentialsStore();
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
      rejected: jobs.filter((j) => j.status === 'REJECTED' || (j.status as string) === 'NOT_INTERESTED').length,
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

  const { platforms, roles, role, location, timeFilter, enableAI } = req.body;
  const targetRoles = roles && Array.isArray(roles) && roles.length > 0
    ? roles
    : role
    ? [role]
    : searchConfig.targetRoles.slice(0, 4);

  scanProgress = {
    isScanning: true,
    percent: 15,
    stage: 'Initializing Scanners',
    detail: `Preparing query for ${targetRoles.join(', ')} (${timeFilter || 'week'})...`
  };

  (async () => {
    try {
      scanProgress.percent = 30;
      scanProgress.stage = 'Scraping Portals';
      scanProgress.detail = `Scanning ${platforms ? platforms.join(', ') : 'selected platforms'} for ${targetRoles.length} target role(s)...`;

      const jobs = await scraperManager.runScan({
        platforms,
        roles: targetRoles,
        location: location || 'India',
        timeFilter: timeFilter || 'week',
        enableAIAnalysis: enableAI ?? true
      });

      scanProgress.percent = 75;
      scanProgress.stage = 'Filtering & Deduplication';
      scanProgress.detail = `Processing ${jobs.length} candidate jobs, screening experience & matching keywords...`;

      await store.saveJobs(jobs);

      if (sheetsSync.isConfigured()) {
        scanProgress.percent = 90;
        scanProgress.stage = 'Google Sheets Sync';
        scanProgress.detail = 'Mirroring rows to your Google Spreadsheet...';
        await sheetsSync.syncJobsToSheet(await store.getAllJobs());
      }

      scanProgress.percent = 100;
      scanProgress.stage = 'Completed';
      scanProgress.detail = `Scan finished! Saved ${jobs.length} jobs across ${targetRoles.length} role(s).`;
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
    const jobId = (req.query.jobId as string) || '';

    const leadInfo = await networkFinder.getLeadsAndPitch(company, jobTitle, jobId);
    res.json({ success: true, leadInfo });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. SMART AUTOFILL LAUNCH & BOOKMARKLET
app.get('/api/autofill/bookmarklet', (req, res) => {
  try {
    const filePath = path.resolve(process.cwd(), 'dist/bookmarklet_raw.js');
    if (fs.existsSync(filePath)) {
      const code = fs.readFileSync(filePath, 'utf8');
      return res.json({ success: true, code });
    }
    res.json({ success: false, message: 'Bookmarklet not found' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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

// 12. PLATFORM CREDENTIALS MANAGEMENT (LinkedIn, Instahyre, Wellfound, Uplers, Simplify)
app.get('/api/credentials', (req, res) => {
  try {
    const creds = credentialsStore.getCredentials();
    res.json({ success: true, credentials: creds });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/credentials', (req, res) => {
  try {
    const creds = req.body;
    const ok = credentialsStore.saveCredentials(creds);
    res.json({ success: ok, message: ok ? 'Credentials updated successfully' : 'Failed to save credentials' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. INGESTION BOOKMARKLET SCRIPT ENDPOINT
app.get('/api/bookmarklet/ingest', (req, res) => {
  try {
    const bookmarklet = getIngestBookmarkletScript();
    res.json({ success: true, bookmarklet });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14. IMPORT JOBS FROM AUTHENTICATED TABS (Simplify, Wellfound, Instahyre, LinkedIn, Direct ATS)
app.post('/api/jobs/import', async (req, res) => {
  try {
    const rawJobs = Array.isArray(req.body.jobs) ? req.body.jobs : (req.body.job ? [req.body.job] : []);
    if (!rawJobs.length) {
      return res.status(400).json({ success: false, message: 'No jobs payload provided' });
    }

    console.log(`\n📥 Ingesting ${rawJobs.length} jobs from browser tab (${req.body.sourcePlatform || req.body.sourceUrl || 'Web'})...`);

    let directAtsCount = 0;
    const processedJobs: JobListing[] = [];

    for (const raw of rawJobs) {
      if (!raw.title || !raw.url) continue;

      const title = raw.title.trim();
      const company = (raw.company || 'Company').trim();
      const location = (raw.location || 'Remote / Flexible').trim();
      const platform = raw.platform || 'direct_ats';
      const cleanId = `imp_${company}_${title}`.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 50);

      // Detect Direct ATS portal
      const ats = detectATSProvider(raw.url);
      const isDirectATS = ats.isDirectATS || platform === 'direct_ats';
      const atsProvider = ats.atsProvider || (isDirectATS ? 'Direct ATS' : undefined);
      if (isDirectATS) directAtsCount++;

      // Strict AI / Keyword Relevance Screening
      const text = `${title} ${company} ${raw.description || ''}`.toLowerCase();
      const titleLower = title.toLowerCase();

      // Check for seniority mismatch
      const isSeniorTitle = /\b(senior|sr\.|sr|lead|staff|principal|director|head of|vp|architect)\b/i.test(titleLower) &&
        !titleLower.includes('junior') && !titleLower.includes('associate');

      const highExpMatch = text.match(/\b([4-9]|1[0-5])\+?\s*(?:to|-)\s*(\d+)?\s*(?:years?|yrs?)/i) ||
        text.match(/\b([4-9]|1[0-5])\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/i);

      let detectedExp = '1-3 years';
      let verdict: JobListing['experienceVerdict'] = 'JUSTIFIABLE_BY_SCALE';
      let isMatch = true;
      let hrNotes = "Matches Priyanshu's 1.5 yrs SRE experience & multi-region EKS scale.";
      let score = 84;
      let rec: JobListing['recommendation'] = 'HIGHLY_RECOMMENDED';

      if (isSeniorTitle || highExpMatch) {
        detectedExp = highExpMatch ? highExpMatch[0] : '4+ years (Senior/Lead)';
        verdict = 'UNQUALIFIED_SENIOR';
        isMatch = false;
        hrNotes = 'Requires senior/lead experience (4+ years). Filtered out as experience gap.';
        score = 35;
        rec = 'NOT_RECOMMENDED';
      } else {
        const juniorMatch = text.match(/\b(0|1|2|3)\s*(?:to|-)\s*(2|3|4)\s*(?:years?|yrs?)/i) ||
          titleLower.includes('junior') || titleLower.includes('associate') || titleLower.includes('entry');
        if (juniorMatch) {
          detectedExp = '0-2 years (Early Career)';
          verdict = 'PERFECT_FIT';
          hrNotes = 'Target 0-2 years junior/associate level. 100% matched.';
          score = 92;
        }
      }

      // Check keywords
      const matchedKw: string[] = [];
      for (const kw of searchConfig.keywords) {
        const cleanKw = kw.toLowerCase().replace(/\([^)]*\)/g, '').trim();
        if (cleanKw.length > 2 && text.includes(cleanKw)) {
          matchedKw.push(kw);
        }
      }

      if (isDirectATS && score < 95 && verdict !== 'UNQUALIFIED_SENIOR') {
        score = Math.min(98, score + 8);
      }

      processedJobs.push({
        id: cleanId,
        platform,
        title,
        company,
        location,
        experienceRequired: raw.experienceRequired || detectedExp,
        detectedYearsRequired: detectedExp,
        experienceVerdict: verdict,
        isExperienceMatch: isMatch,
        hrExperienceNotes: hrNotes,
        isDirectATS,
        atsProvider,
        url: raw.url,
        matchScore: score,
        recommendation: rec,
        matchedKeywords: matchedKw.length ? matchedKw : ['Kubernetes', 'Cloud Infrastructure', 'Linux', 'DevOps'],
        missingKeywords: [],
        description: raw.description || `${title} at ${company}. Imported from authenticated session on ${platform}. Direct portal: ${atsProvider || platform}.`,
        postedDate: raw.postedDate || 'Imported Just Now',
        status: 'NEW'
      });
    }

    const result = await store.saveJobs(processedJobs);

    if (sheetsSync.isConfigured()) {
      sheetsSync.syncJobsToSheet(await store.getAllJobs()).catch(() => {});
    }

    console.log(`   -> Successfully saved: ${result.added} added, ${result.updated} updated (${directAtsCount} Direct ATS).`);
    res.json({
      success: true,
      count: processedJobs.length,
      directAtsCount,
      added: result.added,
      updated: result.updated,
      message: `Successfully ingested ${processedJobs.length} jobs (${directAtsCount} Direct ATS)!`
    });
  } catch (err: any) {
    console.error('Import error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. LIVE ON-DEMAND JOB AUDIT (Visits live URL HTML & re-evaluates with Gemini ATS)
app.post('/api/jobs/:id/audit', async (req, res) => {
  try {
    const { id } = req.params;
    const jobs = await store.getAllJobs();
    const job = jobs.find((j) => j.id === id || j.url === id);

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    console.log(`\n🔍 Live Audit triggered for: ${job.title} at ${job.company}`);
    console.log(`🌐 Visiting live URL: ${job.url}...`);

    let liveText = await scraperManager.fetchLiveJobDescription(job.url, job.platform);
    if (!liveText || liveText.length < 50) {
      liveText = job.description || `${job.title} at ${job.company}. Location: ${job.location || 'India'}.`;
    } else {
      job.description = liveText;
    }

    console.log(`🤖 Running Gemini ATS Recruiter audit on ${liveText.length} characters of live page HTML...`);
    const analysis = await ai.analyzeJobDescription(
      {
        title: job.title,
        company: job.company,
        description: liveText,
        location: job.location
      },
      profile,
      searchConfig.keywords
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

    await store.saveJobs([job]);

    if (sheetsSync.isConfigured()) {
      sheetsSync.syncJobsToSheet(await store.getAllJobs()).catch(() => {});
    }

    console.log(`   -> Updated Verdict: ${job.experienceVerdict} | Score: ${job.matchScore}%`);
    res.json({ success: true, job, analysis });
  } catch (err: any) {
    console.error('Audit error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Job Hunting Dashboard Web Server Running!`);
  console.log(`👉 Open: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
