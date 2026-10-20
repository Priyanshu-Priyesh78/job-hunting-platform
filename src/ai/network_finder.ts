import axios from 'axios';
import { CandidateProfile } from '../types/index.js';
import { GeminiAI } from './gemini.js';

export interface NetworkingLeadInfo {
  company: string;
  brandName: string;
  domain: string;
  emailPattern?: string;
  sampleEmails?: Array<{ email: string; name: string; position: string }>;
  linkedinSearches: {
    alumni: string;
    managers: string;
    recruiters: string;
  };
  googleXraySearches: {
    alumni: string;
    managers: string;
    recruiters: string;
  };
  networkingNote: string;
}

export class NetworkFinder {
  private ai: GeminiAI;
  private profile: CandidateProfile;

  constructor(profile: CandidateProfile, ai: GeminiAI) {
    this.profile = profile;
    this.ai = ai;
  }

  private cleanCompany(company: string): { brandName: string; searchTerms: string } {
    let brand = company
      .replace(/,\s*(LLC|Inc|Ltd|Limited|Corp|Pvt)\.?/gi, '')
      .replace(/\b(Private Limited|Pvt Ltd|Pvt\. Ltd\.|LLC|Inc\.|Corp\.|Technologies|Services|Solutions|Holdings|Software)\b/gi, '')
      .trim();

    if (!brand) brand = company.trim();

    if (brand.toLowerCase().includes('tata consultancy') || brand.toLowerCase() === 'tcs') {
      return { brandName: 'TCS', searchTerms: '("TCS" OR "Tata Consultancy")' };
    }

    return { brandName: brand, searchTerms: `"${brand}"` };
  }

  private cleanDomain(brandName: string): string {
    const clean = brandName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
    return clean ? `${clean}.com` : 'company.com';
  }

  private humanizeAndTrim(text: string, brandName: string): string {
    let cleaned = text
      .replace(/^(Subject|Note|Message|Draft|Connection Request):?/i, '')
      .replace(/^(Dear|Hello there|Hope this finds you well|I am thrilled to reach out|Greetings),?/gi, 'Hi [Name],')
      .replace(/\b(delve|testament|esteemed|plethora|thrilled|spearheading|harnessing)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Ensure under 200-220 characters
    if (cleaned.length > 220) {
      // Split by sentences and keep first sentences that fit
      const sentences = cleaned.split(/(?<=[.!?])\s+/);
      let acc = '';
      for (const s of sentences) {
        if ((acc + ' ' + s).trim().length <= 210) {
          acc = (acc + ' ' + s).trim();
        } else {
          break;
        }
      }
      cleaned = acc || cleaned.slice(0, 195) + '...';
    }

    if (!cleaned || cleaned.length < 30) {
      cleaned = `Hi [Name], fellow LNCT grad here! Love what you're doing at ${brandName}. I manage 14+ production EKS clusters at Revent Labs—would love to connect with fellow SREs here!`;
    }

    return cleaned;
  }

  async getLeadsAndPitch(company: string, jobTitle: string): Promise<NetworkingLeadInfo> {
    const { brandName, searchTerms } = this.cleanCompany(company);
    const domain = this.cleanDomain(brandName);
    const hunterKey = process.env.HUNTER_API_KEY;

    let emailPattern = `{first}.{last}@${domain}`;
    let sampleEmails: Array<{ email: string; name: string; position: string }> = [];

    if (hunterKey) {
      try {
        const resp = await axios.get(
          `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${hunterKey}`,
          { timeout: 5000 }
        );
        if (resp.data && resp.data.data) {
          emailPattern = resp.data.data.pattern ? `{${resp.data.data.pattern}}@${domain}` : emailPattern;
          sampleEmails = (resp.data.data.emails || []).slice(0, 3).map((e: any) => ({
            email: e.value,
            name: `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Team Member',
            position: e.position || 'Employee'
          }));
        }
      } catch (err: any) {
        // Hunter.io notice
      }
    }

    // 1. Strict boolean LinkedIn search queries
    const linkedinSearches = {
      alumni: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        `("LNCT" OR "Lakshmi Narain") AND ${searchTerms}`
      )}`,
      managers: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        `("DevOps Lead" OR "Engineering Manager" OR "Head of DevOps" OR "SRE Lead") AND ${searchTerms}`
      )}`,
      recruiters: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        `("Technical Recruiter" OR "Talent Acquisition" OR "HR") AND ${searchTerms}`
      )}`
    };

    // 2. High-precision Google X-Ray Search URLs
    const googleXraySearches = {
      alumni: `https://www.google.com/search?q=${encodeURIComponent(
        `site:linkedin.com/in ("LNCT" OR "Lakshmi Narain") ${searchTerms}`
      )}`,
      managers: `https://www.google.com/search?q=${encodeURIComponent(
        `site:linkedin.com/in ("DevOps Lead" OR "Engineering Manager" OR "SRE Lead") ${searchTerms}`
      )}`,
      recruiters: `https://www.google.com/search?q=${encodeURIComponent(
        `site:linkedin.com/in ("Technical Recruiter" OR "Talent Acquisition") ${searchTerms}`
      )}`
    };

    const prompt = `You are a real human software engineer writing a warm, casual LinkedIn connection request note for Priyanshu Priyesh to someone at ${brandName}.

CRITICAL CONSTRAINT:
- TOTAL LENGTH MUST BE STRICTLY UNDER 200 CHARACTERS (MAX 210 CHARACTERS). LinkedIn connection request limit is 300 characters.
- HUMAN TONE ONLY: No robotic AI cliches ("I hope this finds you well", "thrilled", "esteemed", "delve").
- Write 2 casual, authentic human sentences.

Priyanshu's Profile:
- SRE at Revent Labs (runs 14+ production EKS clusters, zero downtime).
- LNCT Bhopal 2025 B.Tech grad.
- Target Company: ${brandName}.

Example 1 (for alumni):
"Hi [Name], fellow LNCT 2025 grad here! Love what you're building at ${brandName}. I run 14+ EKS clusters at Revent Labs—would love to connect & say hi!"

Example 2 (for lead/recruiter):
"Hi [Name], saw your DevOps work at ${brandName}. I manage 14+ production EKS clusters at Revent Labs and would love to connect with fellow SREs here!"

Output ONLY the final 1-2 sentence connection note. Do not exceed 200 characters.`;

    let networkingNote = '';
    try {
      networkingNote = await (this.ai as any).callWithFallback(prompt, false);
      networkingNote = this.humanizeAndTrim(networkingNote, brandName);
    } catch {
      networkingNote = `Hi [Name], fellow LNCT 2025 grad here! Love what you're building at ${brandName}. I run 14+ EKS clusters at Revent Labs—would love to connect with fellow SREs!`;
    }

    return {
      company,
      brandName,
      domain,
      emailPattern,
      sampleEmails,
      linkedinSearches,
      googleXraySearches,
      networkingNote
    };
  }
}
