import fs from 'fs';
import { google } from 'googleapis';
import { JobListing } from '../types/index.js';

export class GoogleSheetsSync {
  private sheetId?: string;
  private keyPath?: string;
  private webhookUrl?: string;

  constructor() {
    this.sheetId = process.env.GOOGLE_SHEET_ID;
    this.keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    this.webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  }

  isConfigured(): boolean {
    if (this.webhookUrl) return true;
    return !!(this.sheetId && this.keyPath && fs.existsSync(this.keyPath));
  }

  async syncJobsToSheet(jobs: JobListing[]): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    // Support Webhook mode (no GCP keys needed)
    if (this.webhookUrl) {
      try {
        const resp = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobs),
          redirect: 'follow'
        });
        return resp.ok;
      } catch (err: any) {
        console.error('Google Sheet Webhook sync error:', err.message);
        return false;
      }
    }

    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: this.keyPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      const sheets = google.sheets({ version: 'v4', auth });

      const header = [
        'ID',
        'Platform',
        'Direct ATS',
        'ATS Provider',
        'Title',
        'Company',
        'Location',
        'Exp Required',
        'Match Score %',
        'Recommendation',
        'Matched Keywords',
        'Missing Keywords',
        'Application URL',
        'Status',
        'Date Posted',
        'Date Applied',
        'Notes'
      ];

      const rows = jobs.map((j) => [
        j.id,
        j.platform,
        j.isDirectATS ? 'YES' : 'NO',
        j.atsProvider || '',
        j.title,
        j.company,
        j.location,
        j.experienceRequired,
        j.matchScore ?? '',
        j.recommendation ?? '',
        (j.matchedKeywords || []).join(', '),
        (j.missingKeywords || []).join(', '),
        j.url,
        j.status || 'NEW',
        j.postedDate || '',
        j.appliedDate || '',
        j.notes || ''
      ]);

      const values = [header, ...rows];

      await sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });

      return true;
    } catch (err: any) {
      console.error('Google Sheets sync error:', err.message);
      return false;
    }
  }
}
