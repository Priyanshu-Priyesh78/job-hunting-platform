import axios from 'axios';
import { CandidateProfile } from '../types/index.js';
import { GeminiAI } from './gemini.js';

export interface NetworkingLeadInfo {
  company: string;
  domain: string;
  emailPattern?: string;
  sampleEmails?: Array<{ email: string; name: string; position: string }>;
  linkedinSearches: {
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

  private cleanDomain(company: string): string {
    const clean = company
      .toLowerCase()
      .replace(/\b(private|ltd|limited|llc|inc|technologies|services|solutions|corp|corporation)\b/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
    return clean ? `${clean}.com` : 'company.com';
  }

  async getLeadsAndPitch(company: string, jobTitle: string): Promise<NetworkingLeadInfo> {
    const domain = this.cleanDomain(company);
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
        // Hunter.io notice or rate limit
      }
    }

    const linkedinSearches = {
      alumni: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        `"LNCT" OR "Lakshmi Narain" "${company}"`
      )}`,
      managers: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        `"Engineering Manager" OR "DevOps Lead" OR "Head of Platform" "${company}"`
      )}`,
      recruiters: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        `"Technical Recruiter" OR "Talent Acquisition" "${company}"`
      )}`
    };

    const prompt = `You are helping Priyanshu Priyesh (Software Engineer / SRE with hands-on experience running 14+ production EKS clusters, Gloo Gateway, Terraform, ArgoCD, and LNCT Bhopal 2025 B.Tech graduate) write a personalized 180-200 word networking / referral message.

Target: A contact (fellow LNCT Bhopal alumnus, DevOps engineering lead, or tech recruiter) at ${company}.
Target Job Opening: ${jobTitle} at ${company}.

Priyanshu's Profile Highlights:
- SRE / Platform Engineer at Revent Labs (since Jan 2025).
- Owned 14+ production EKS clusters across 7 AWS regions and 280+ nodes with zero downtime.
- IaC with Terraform/Terragrunt, GitOps with ArgoCD, observability with Prometheus/Grafana.
- Education: Lakshmi Narain College of Technology (LNCT), Bhopal (CSE, 2025, 8.45 CGPA).

Write a compelling, respectful, and warm message (around 180-200 words):
- If the recipient is an LNCT alumnus or colleague at ${company}, mention the shared engineering passion / connection.
- Highlight his verified scale (14+ EKS clusters, multi-region AWS, zero downtime).
- Express genuine interest in ${company}'s infrastructure and the ${jobTitle} role.
- Ask for a quick 10-minute coffee chat or if they would be comfortable sharing a referral.

Provide ONLY the text of the message, written in Priyanshu's voice.`;

    let networkingNote = '';
    try {
      networkingNote = await (this.ai as any).callWithFallback(prompt, false);
      networkingNote = networkingNote.trim();
    } catch {
      networkingNote = `Hi [Name],

I hope you're doing well! I came across your profile while exploring the impressive engineering work being done at ${company}, and wanted to reach out.

I am an SRE / Cloud Platform Engineer currently at Revent Labs (and an LNCT Bhopal 2025 CSE graduate). In my current role, I manage and scale 14+ production EKS clusters spanning 7 AWS regions with 280+ nodes, maintaining zero customer-facing downtime. My core stack includes Terraform/Terragrunt, Gloo API Gateway, GitOps with ArgoCD, and Prometheus/Grafana observability.

I recently noticed the ${jobTitle} opening at ${company} and felt my production platform engineering background strongly aligns with your infrastructure goals. I would love to connect and learn more about how your team approaches reliability and scale. If you are open to it, I'd deeply appreciate a brief 10-minute conversation or any advice on the team.

Thank you so much for your time!

Best regards,
Priyanshu Priyesh
priyanshupriyesh78@gmail.com | 8809003179`;
    }

    return {
      company,
      domain,
      emailPattern,
      sampleEmails,
      linkedinSearches,
      networkingNote
    };
  }
}
