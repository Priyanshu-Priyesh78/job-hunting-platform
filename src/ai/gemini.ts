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
    const prompt = `You are an expert technical recruiter and SRE/DevOps hiring manager.
Analyze the following Job Description against the Candidate's profile and technical keywords.

### Candidate Profile:
Name: ${profile.personal.fullName}
Current Title: ${profile.headline}
Experience: ${profile.experienceYears} years (${profile.experienceLevel})
Current Role: Software Engineer I at Revent Labs (Jan 2025 - Present)
Key Highlights:
- Owned 14+ production EKS clusters spanning 7 AWS regions and 280+ nodes, quarterly zero-downtime upgrades.
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

### Job Posting:
Company: ${job.company}
Title: ${job.title}
Location: ${job.location || 'Not specified'}
Job Description:
${job.description.slice(0, 4000)}

### Instructions:
Return a valid JSON object matching this schema:
{
  "matchScore": number (0 to 100 integer representing match quality for 0-2 yrs candidate),
  "recommendation": "HIGHLY_RECOMMENDED" | "GOOD_MATCH" | "WEAK_MATCH" | "NOT_RECOMMENDED",
  "matchedKeywords": string[] (list of keywords from our target list or skills that the JD asks for and candidate has),
  "missingKeywords": string[] (important skills asked by the JD that the candidate might lack or should highlight),
  "jdSummary": string (2-3 concise sentences summarizing key responsibilities, tech stack, and experience requirement),
  "resumeTweaks": string[] (2-3 specific bullet points recommending which parts of Priyanshu's real experience to emphasize for this role),
  "draftCoverLetter": string (A crisp 120-150 word application note pitch tailored specifically to this company and role, highlighting 14+ EKS clusters, Gloo Gateway, GitOps, and SRE incident response)
}

Provide ONLY the valid JSON response.`;

    const rawResponse = await this.callWithFallback(prompt, true);
    try {
      const parsed = JSON.parse(rawResponse);
      return {
        matchScore: parsed.matchScore ?? 50,
        recommendation: parsed.recommendation ?? 'GOOD_MATCH',
        matchedKeywords: parsed.matchedKeywords ?? [],
        missingKeywords: parsed.missingKeywords ?? [],
        jdSummary: parsed.jdSummary ?? '',
        resumeTweaks: parsed.resumeTweaks ?? [],
        draftCoverLetter: parsed.draftCoverLetter ?? ''
      };
    } catch (e) {
      // Clean JSON markdown blocks if present
      const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    }
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
