import dotenv from 'dotenv';
import { CandidateProfile, JDAnalysisResult, JobListing } from '../types/index.js';

dotenv.config();

const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.8-flash'
];

export class GeminiAI {
  private apiKey: string;
  private currentModelIndex = 0;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️ No GEMINI_API_KEY found in environment or constructor');
    }
  }

  public async callWithFallback(prompt: string, jsonMode = false): Promise<string> {
    let lastError: any = null;

    for (let attempt = 0; attempt < FALLBACK_MODELS.length; attempt++) {
      const model = FALLBACK_MODELS[(this.currentModelIndex + attempt) % FALLBACK_MODELS.length];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

      try {
        const bodyPayload: any = {
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ]
        };

        if (jsonMode) {
          bodyPayload.generationConfig = {
            responseMimeType: 'application/json'
          };
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload),
          signal: AbortSignal.timeout(20000)
        });

        const data = await response.json();

        if (response.ok && data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
          this.currentModelIndex = (this.currentModelIndex + attempt) % FALLBACK_MODELS.length;
          return data.candidates[0].content.parts[0].text;
        }

        const errMsg = data.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        lastError = new Error(`Model ${model} failed: ${errMsg}`);
        // If high demand or not found, try next model
        continue;
      } catch (err: any) {
        lastError = err;
      }
    }

    throw lastError || new Error('All Gemini models failed');
  }

  async analyzeJobDescription(
    job: { title: string; company: string; description: string; location?: string },
    profile: CandidateProfile,
    targetKeywords: string[]
  ): Promise<JDAnalysisResult> {
    const prompt = `You are a Principal Technical Recruiter and Head of Talent Acquisition specializing in Infrastructure, SRE, Platform Engineering, and Cloud Architecture, operating an enterprise ATS screening engine.
You are evaluating a candidate's fit for an engineering job posting.

### Candidate Profile:
Name: ${profile.personal.fullName}
Degree: B.Tech Computer Science Engineering (Graduated 2025, CGPA: 8.45/10, LNCT Bhopal)
Current Title: ${profile.headline}
Experience: ${profile.experienceYears} years (${profile.experienceLevel})
Current Role: Software Engineer I at Revent Labs (Jan 2025 - Present)
Key Highlights & Production Scale:
- Owned 14+ production EKS clusters spanning 7 AWS regions and 280+ nodes with zero downtime upgrades.
- Gateway Engineering team: Gloo Gateway Proxy, RateLimit, ExtAuth pods, network troubleshooting.
- Managed multi-region AWS WAF, Global Accelerator, ALB, Route 53, Shield Advanced, S3/Athena log analytics.
- Managed and standardized Terraform/Terragrunt across 13+ projects and multiple AWS accounts with Atlantis.
- CI/CD & GitOps: ArgoCD, GitHub Actions, Jsonnet, 21 GitOps instances.
- Observability: Prometheus, VictoriaMetrics, Grafana, Alertmanager, Fluent Bit, OpenSearch, Kibana, CloudWatch.

### Candidate Key Technical Skills:
Cloud: ${profile.skills.cloud.join(', ')}
Kubernetes: ${profile.skills.kubernetes.join(', ')}
IaC: ${profile.skills.iac.join(', ')}
CI/CD: ${profile.skills.cicd.join(', ')}
Observability: ${profile.skills.observability.join(', ')}

### Target Keywords to look for:
${targetKeywords.join(', ')}

### Job Posting to Evaluate:
Company: ${job.company}
Title: ${job.title}
Location: ${job.location || 'Not specified'}
Job Description:
${job.description.slice(0, 4500)}

### Evaluation Guidelines (Think like a Senior Technical HR Recruiter & ATS):
1. **Experience Detection**: Inspect the job title and description for experience requirements (e.g. 0-2 yrs, 1-3 yrs, 3-5 yrs, 5+ yrs, Senior/Lead/Staff/Principal).
2. **Experience Verdict & Match Quality**:
   - "PERFECT_FIT": 0–2 years required or Entry/Junior level. Priyanshu is in top 1% due to 14+ cluster production scale. Match score 85-98%.
   - "JUSTIFIABLE_BY_SCALE": 2–4 years required or Mid-level. Priyanshu's multi-region 14+ cluster ownership, Gloo Gateway, and GitOps scale easily outclasses typical 3-year engineers. Candidate is qualified. Match score 75-92%.
   - "EXPERIENCE_GAP": 4–5 years required. Stretch role. Candidate can apply if tech stack strongly aligns, but notes experience gap. Match score 50-68%.
   - "UNQUALIFIED_SENIOR": 5+ years, 7+ years, 8+ years, or Senior/Staff/Principal/Lead titles. Flag strictly as EXPERIENCE_MISMATCH. Demote match score to below 40% and set recommendation to "NOT_RECOMMENDED" so user does not waste time applying.
3. **HR Screening Rationale**: Write 1-2 realistic, human sentences from the recruiter's viewpoint explaining the screening verdict (e.g. "Role asks for 2-3 years. Priyanshu's production scale managing 14+ EKS clusters across 7 AWS regions with Atlantis and Gloo Gateway justifies advancing him to phone screen.").
4. **ATS Keywords**: Trace all matched technical skills and highlight critical missing technologies.
5. **Resume Tweaks**: 3 concrete, actionable bullets for tailoring Priyanshu's resume to this specific opening.
6. **Application Pitch**: A crisp 120-150 word application pitch highlighting his 14+ clusters, GitOps, and platform engineering skills.

### Return Format:
Return ONLY a valid JSON object matching this schema:
{
  "detectedYearsRequired": "string (e.g. '0-2 years', '2-4 years', '3-5 years', '5+ years', or 'Not specified')",
  "isExperienceMatch": boolean (true if <= 4 years or junior/mid; false if strictly 5+ years or senior/staff),
  "experienceVerdict": "PERFECT_FIT" | "JUSTIFIABLE_BY_SCALE" | "EXPERIENCE_GAP" | "UNQUALIFIED_SENIOR",
  "hrExperienceNotes": "string (1-2 sentences with recruiter's exact screening rationale)",
  "matchScore": number (0 to 100 integer reflecting ATS + experience fit),
  "recommendation": "HIGHLY_RECOMMENDED" | "GOOD_MATCH" | "WEAK_MATCH" | "NOT_RECOMMENDED",
  "matchedKeywords": ["string"],
  "missingKeywords": ["string"],
  "jdSummary": "string (2-3 concise sentences summarizing key responsibilities and tech stack)",
  "resumeTweaks": ["string", "string", "string"],
  "draftCoverLetter": "string (Crisp 120-150 word tailored application pitch)"
}

Provide ONLY the valid JSON response.`;

    const rawResponse = await this.callWithFallback(prompt, true);
    let parsed: any;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (e) {
      const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    // Safety guardrails for Senior / Staff / 5+ years positions
    const titleLower = job.title.toLowerCase();
    const isStrictSenior = /\b(senior|sr\.|sr|lead|staff|principal|director|head of|vp|architect)\b/i.test(titleLower) &&
      !titleLower.includes('junior') && !titleLower.includes('associate');
    const isSeniorYears = /\b([5-9]|1[0-5])\+?\s*(?:to|-)?\s*(\d+)?\s*(?:years?|yrs?)/i.test(parsed.detectedYearsRequired || '');

    if (isStrictSenior || isSeniorYears) {
      parsed.experienceVerdict = 'UNQUALIFIED_SENIOR';
      parsed.isExperienceMatch = false;
      parsed.hrExperienceNotes = `Role strictly requires ${parsed.detectedYearsRequired || 'Senior/Staff experience'}. With 1.5 yrs total experience, ATS screening will filter this out as a senior grade mismatch.`;
      parsed.matchScore = Math.min(parsed.matchScore ?? 35, 38);
      parsed.recommendation = 'NOT_RECOMMENDED';
    }

    return {
      detectedYearsRequired: parsed.detectedYearsRequired ?? '0-2 years',
      isExperienceMatch: parsed.isExperienceMatch ?? true,
      experienceVerdict: parsed.experienceVerdict ?? (parsed.matchScore >= 75 ? 'PERFECT_FIT' : 'EXPERIENCE_GAP'),
      hrExperienceNotes: parsed.hrExperienceNotes ?? '',
      matchScore: parsed.matchScore ?? 50,
      recommendation: parsed.recommendation ?? 'GOOD_MATCH',
      matchedKeywords: parsed.matchedKeywords ?? [],
      missingKeywords: parsed.missingKeywords ?? [],
      jdSummary: parsed.jdSummary ?? '',
      resumeTweaks: parsed.resumeTweaks ?? [],
      draftCoverLetter: parsed.draftCoverLetter ?? ''
    };
  }

  async answerApplicationQuestion(
    question: string,
    profile: CandidateProfile,
    jobContext?: { title: string; company: string }
  ): Promise<string> {
    const prompt = `You are assisting Priyanshu Priyesh (Software Engineer / SRE with 1.5 yrs experience running 14+ production EKS clusters across 7 AWS regions, Gloo Gateway, Terraform/Terragrunt, ArgoCD, VictoriaMetrics/Grafana) fill out an application form.

Target Job: ${jobContext?.title || 'DevOps / SRE'} at ${jobContext?.company || 'Target Company'}

The application form asks this question:
"${question}"

Candidate Details:
- Name: Priyanshu Priyesh
- Current Role: Software Engineer I at Revent Labs (since Jan 2025)
- Highlights: 14+ EKS clusters, 280+ nodes, zero customer-facing downtime upgrades, Gloo API Gateway, Atlantis/Terraform across 13+ projects, Prometheus/VictoriaMetrics/Grafana observability.
- Notice Period: 15-30 days / Immediate
- Location preference: Open to Bangalore, Hyderabad, Pune, Mumbai, Delhi NCR, Remote

Instructions:
Write a professional, authentic, first-person response ("I ...") directly answering the question.
- Keep it concise, truthful to Priyanshu's resume, and confident.
- Do NOT make up false employment dates or degrees.
- If it's a numeric question (years of experience, notice period, etc.), answer directly with the number/short phrase.
- If it's a behavioral or motivational question ("Why this company?", "Describe a challenge you solved"), write 2-4 punchy sentences referencing real engineering experience (e.g. root cause analysis, zero-downtime upgrades, Gloo gateway troubleshooting).

Provide ONLY the answer text, no conversational filler or greetings.`;

    const text = await this.callWithFallback(prompt, false);
    return text.trim();
  }
}
