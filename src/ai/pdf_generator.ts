import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { SearchConfig } from '../types/index.js';

const RESUMES_DIR = path.resolve(process.cwd(), 'resumes');

export interface ResumeData {
  fullName: string;
  headline: string;
  phone: string;
  email: string;
  linkedin: string;
  summary: string;
  skills: {
    cloud: string[];
    kubernetes: string[];
    iac: string[];
    cicd: string[];
    observability: string[];
    security: string[];
    programming: string[];
  };
  workExperience: Array<{
    company: string;
    title: string;
    location: string;
    dates: string;
    bullets: string[];
  }>;
  education: Array<{
    institution: string;
    location: string;
    degree: string;
    dates: string;
    cgpa?: string;
  }>;
}

export class ResumePdfGenerator {
  private config: SearchConfig;

  constructor(config: SearchConfig) {
    this.config = config;
    if (!fs.existsSync(RESUMES_DIR)) {
      fs.mkdirSync(RESUMES_DIR, { recursive: true });
    }
  }

  async generatePdf(companyName: string, resumeData: ResumeData): Promise<{ filename: string; filePath: string }> {
    const cleanCompany = companyName.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30);
    const filename = `PRIYANSHU_PRIYESH_${cleanCompany || 'CUSTOM'}.pdf`;
    const filePath = path.join(RESUMES_DIR, filename);

    const html = this.buildResumeHtml(resumeData);

    const browser = await chromium.launch({
      executablePath: this.config.chromeExecutablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });

      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0.35in',
          bottom: '0.35in',
          left: '0.45in',
          right: '0.45in'
        }
      });

      console.log(`Generated tailored PDF: ${filePath}`);
      return { filename, filePath };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  private buildResumeHtml(data: ResumeData): string {
    const cleanLinkedin = data.linkedin.replace(/^https?:\/\/(www\.)?/, '');

    const cloudSkills = (data.skills.cloud || []).join(', ');
    const k8sSkills = (data.skills.kubernetes || []).join(', ');
    const iacSkills = (data.skills.iac || []).join(', ');
    const cicdSkills = (data.skills.cicd || []).join(', ');
    const obsSkills = (data.skills.observability || []).join(', ');
    const secSkills = (data.skills.security || []).join(', ');
    const progSkills = (data.skills.programming || []).join(', ');

    const experienceHtml = (data.workExperience || []).map(exp => `
      <div style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <div><strong style="font-size: 13px; color: #0f172a;">${exp.company}</strong> <span style="font-size: 11.5px; color: #475569;">— ${exp.location}</span></div>
          <div style="font-size: 11.5px; color: #475569;">${exp.dates}</div>
        </div>
        <div style="font-size: 12px; font-weight: 600; color: #1e293b; margin-top: 1px; margin-bottom: 4px;">${exp.title}</div>
        <ul style="margin: 0; padding-left: 18px; font-size: 11px; line-height: 1.45; color: #334155;">
          ${(exp.bullets || []).map(b => `<li style="margin-bottom: 3px;">${b}</li>`).join('')}
        </ul>
      </div>
    `).join('');

    const educationHtml = (data.education || []).map(edu => `
      <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 11.5px; color: #334155;">
        <div><strong>${edu.institution}</strong> — ${edu.location}</div>
        <div>${edu.dates}</div>
      </div>
      <div style="font-size: 11px; color: #475569; display: flex; justify-content: space-between;">
        <span>${edu.degree}</span>
        ${edu.cgpa ? `<span>CGPA: <strong>${edu.cgpa}</strong></span>` : ''}
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${data.fullName} - Resume</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #0f172a;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .header { text-align: center; margin-bottom: 12px; border-bottom: 1.5px solid #0f172a; padding-bottom: 8px; }
    .name { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin: 0 0 3px 0; }
    .headline { font-size: 11px; font-weight: 600; color: #334155; margin-bottom: 4px; }
    .contact { font-size: 10.5px; color: #475569; }
    .section-title {
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 2px;
      margin-top: 10px;
      margin-bottom: 6px;
      color: #0f172a;
    }
    .summary-text { font-size: 11px; line-height: 1.45; color: #334155; margin: 0; text-align: justify; }
    .skill-row { font-size: 10.5px; line-height: 1.4; margin-bottom: 2.5px; color: #334155; }
    .skill-label { font-weight: 700; color: #0f172a; display: inline-block; width: 145px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="name">${data.fullName}</div>
    <div class="headline">${data.headline}</div>
    <div class="contact">
      ${data.phone} &nbsp;•&nbsp; ${data.email} &nbsp;•&nbsp; ${cleanLinkedin}
    </div>
  </div>

  <div class="section-title">Summary</div>
  <p class="summary-text">${data.summary}</p>

  <div class="section-title">Technical Skills</div>
  <div class="skill-row"><span class="skill-label">Cloud & AWS:</span> ${cloudSkills}</div>
  <div class="skill-row"><span class="skill-label">Kubernetes & Containers:</span> ${k8sSkills}</div>
  <div class="skill-row"><span class="skill-label">Infrastructure as Code:</span> ${iacSkills}</div>
  <div class="skill-row"><span class="skill-label">CI/CD & GitOps:</span> ${cicdSkills}</div>
  <div class="skill-row"><span class="skill-label">Observability & SRE:</span> ${obsSkills}</div>
  <div class="skill-row"><span class="skill-label">Security & Operations:</span> ${secSkills}</div>
  <div class="skill-row"><span class="skill-label">Programming & Systems:</span> ${progSkills}</div>

  <div class="section-title">Professional Experience</div>
  ${experienceHtml}

  <div class="section-title">Education</div>
  ${educationHtml}
</body>
</html>`;
  }
}

