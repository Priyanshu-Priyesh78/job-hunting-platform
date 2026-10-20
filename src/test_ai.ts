import { GeminiAI } from './ai/gemini.js';
import fs from 'fs';

const profile = JSON.parse(fs.readFileSync('./config/profile.json', 'utf8'));
const searchConfig = JSON.parse(fs.readFileSync('./config/search_config.json', 'utf8'));

const ai = new GeminiAI();
async function test() {
  console.log('Testing Gemini API with Candidate Profile...');
  const result = await ai.analyzeJobDescription({
    title: 'Junior DevOps / SRE Engineer',
    company: 'TechCorp Cloud Systems',
    description: 'We are looking for a Junior DevOps / SRE Engineer with 1-2 years experience in AWS, Kubernetes (EKS), Terraform, Docker, and CI/CD pipelines (GitHub Actions/ArgoCD). Experience with Prometheus and Grafana monitoring is a huge plus.',
    location: 'Bangalore / Remote'
  }, profile, searchConfig.keywords);

  console.log('=== Gemini Analysis Success ===');
  console.log('Match Score:', result.matchScore);
  console.log('Recommendation:', result.recommendation);
  console.log('Matched Keywords:', result.matchedKeywords);
  console.log('Missing Keywords:', result.missingKeywords);
  console.log('Summary:', result.jdSummary);
  console.log('Resume Tweaks:', result.resumeTweaks);
  console.log('\nDraft Cover Letter:\n' + result.draftCoverLetter);
}

test().catch(err => {
  console.error('Error running test:', err);
});

