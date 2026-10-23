import { CandidateProfile, JobListing } from '../types/index.js';
import { GeminiAI } from './gemini.js';

export interface TailoredResumeResult {
  jobTitle: string;
  company: string;
  detectedYearsRequired?: string;
  experienceVerdict?: string;
  hrExperienceNotes?: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  tailoredSummary: string;
  tailoredExperienceBullets: string[];
  recommendedSkillsOrder: string[];
  coverLetterPitch: string;
  fullMarkdownResume: string;
}

export class ResumeTailorer {
  private ai: GeminiAI;
  private profile: CandidateProfile;

  constructor(profile: CandidateProfile, ai: GeminiAI) {
    this.profile = profile;
    this.ai = ai;
  }

  async tailorResumeForJob(job: {
    title: string;
    company: string;
    description: string;
  }): Promise<TailoredResumeResult> {
    const prompt = `You are an elite SRE/DevOps executive resume coach and ATS optimization specialist.
You are tailoring the resume of Priyanshu Priyesh for a specific job application.

### Candidate Details (True facts only, do not hallucinate):
- Name: Priyanshu Priyesh
- Email: priyanshupriyesh78@gmail.com | Phone: 8809003179
- LinkedIn: linkedin.com/in/priyanshu-priyesh-187340233
- Title: Software Engineer / SRE — AWS — Kubernetes — Terraform — Platform Engineering
- Education: Lakshmi Narain College of Technology (LNCT), Bhopal, B.Tech CSE (Graduated 2025, CGPA: 8.45/10)
- Current Role: Software Engineer I at Revent Labs (Jan 2025 – Present, Indore, India)
- True Core Achievements:
  * Owned 14+ production EKS clusters spanning 7 AWS regions and 280+ nodes, quarterly platform upgrades with zero downtime.
  * Gateway Engineering: Gloo Gateway Proxy, RateLimit, ExtAuth pods across multi-region EKS clusters.
  * Multi-region AWS networking & security: WAF, Global Accelerator, ALB, Route 53, Shield Advanced, S3/Athena log analytics.
  * Terraform/Terragrunt across 13+ projects, Atlantis CI/CD workflows, eliminating IaC anti-patterns.
  * 21 GitOps instances (ArgoCD, GitHub Actions, Jsonnet).
  * Observability: Prometheus, VictoriaMetrics, Grafana, Alertmanager, Fluent Bit, OpenSearch, Kibana, CloudWatch.

### Target Job:
Company: ${job.company}
Title: ${job.title}
Job Description:
${job.description.slice(0, 4000)}

### Instructions:
Generate an ATS-optimized, high-impact resume enhancement specifically tailored for this job posting.
Rules:
1. Detect experience required in JD (e.g. 0-2 yrs, 2-4 yrs, 3-5 yrs, 5+ yrs). If the JD demands 5+, 7+, 8+ years or has Senior/Staff/Principal/Lead in title, set experienceVerdict strictly to "UNQUALIFIED_SENIOR". If 0-2 years, set "PERFECT_FIT". If 2-4 years, set "JUSTIFIABLE_BY_SCALE" (outclassed by Priyanshu's 14+ cluster ownership). If 4-5 years, set "EXPERIENCE_GAP".
2. Provide a 1-sentence HR recruiter screening note explaining why Priyanshu's production scale qualifies him (or flagging the senior experience mismatch).
3. Tailor the professional summary to directly address the company's tech stack and pain points.
4. Select and rewrite 4-5 bullet points from Priyanshu's real Revent Labs experience to highlight the exact keywords and skills this employer cares about most (e.g. AWS vs K8s vs IaC vs Observability).
5. Identify missing keywords that Priyanshu should weave into his interview or cover letter.
6. Generate a tailored 120-150 word application pitch / cover letter.
7. Generate the complete tailored Resume in clean GitHub Flavored Markdown.

Return ONLY a valid JSON object matching this schema:
{
  "jobTitle": "${job.title}",
  "company": "${job.company}",
  "detectedYearsRequired": "string (e.g. '0-2 years', '2-4 years', '3-5 years', '5+ years')",
  "experienceVerdict": "PERFECT_FIT" | "JUSTIFIABLE_BY_SCALE" | "EXPERIENCE_GAP" | "UNQUALIFIED_SENIOR",
  "hrExperienceNotes": "string (1-2 sentences with recruiter's exact screening rationale)",
  "matchedKeywords": ["string", "string"],
  "missingKeywords": ["string", "string"],
  "tailoredSummary": "A punchy 3-sentence summary tailored to this role",
  "tailoredExperienceBullets": [
    "High-impact bullet with strong action verb and quantified metrics tailored for this role",
    "High-impact bullet with strong action verb and quantified metrics tailored for this role",
    "High-impact bullet with strong action verb and quantified metrics tailored for this role",
    "High-impact bullet with strong action verb and quantified metrics tailored for this role"
  ],
  "recommendedSkillsOrder": ["Top skills to place first in technical skills section"],
  "coverLetterPitch": "Crisp 120-word cover note tailored to the company",
  "fullMarkdownResume": "Complete markdown text of the customized resume"
}`;

    // Call Gemini using the fallback cascade
    const raw = await (this.ai as any).callWithFallback(prompt, true);
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    const titleLower = job.title.toLowerCase();
    const isStrictSenior = /\b(senior|sr\.|sr|lead|staff|principal|director|head of|vp|architect)\b/i.test(titleLower) &&
      !titleLower.includes('junior') && !titleLower.includes('associate');
    const isSeniorYears = /\b([5-9]|1[0-5])\+?\s*(?:to|-)?\s*(\d+)?\s*(?:years?|yrs?)/i.test(parsed.detectedYearsRequired || '');

    if (isStrictSenior || isSeniorYears) {
      parsed.experienceVerdict = 'UNQUALIFIED_SENIOR';
      parsed.hrExperienceNotes = `Role strictly demands ${parsed.detectedYearsRequired || 'Senior/Staff experience'}. Candidate's 1.5 yrs total tenure will face automatic ATS rejection for this senior band.`;
    }

    return parsed;
  }
}

