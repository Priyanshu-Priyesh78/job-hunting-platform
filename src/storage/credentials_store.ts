import fs from 'fs';
import path from 'path';

export interface PlatformCredentials {
  email?: string;
  password?: string;
  token?: string;
  sessionCookie?: string;
}

export interface CredentialsConfig {
  linkedin?: PlatformCredentials;
  instahyre?: PlatformCredentials;
  wellfound?: PlatformCredentials;
  uplers?: PlatformCredentials;
  simplify?: PlatformCredentials;
}

const CREDENTIALS_FILE = path.resolve(process.cwd(), 'config/credentials.json');

export class CredentialsStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || CREDENTIALS_FILE;
  }

  getCredentials(): CredentialsConfig {
    if (!fs.existsSync(this.filePath)) {
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  saveCredentials(creds: CredentialsConfig): boolean {
    try {
      const existing = this.getCredentials();
      const merged = { ...existing, ...creds };
      fs.writeFileSync(this.filePath, JSON.stringify(merged, null, 2), 'utf8');
      return true;
    } catch (err: any) {
      console.error('Error saving credentials:', err.message);
      return false;
    }
  }

  getPlatformCredentials(platform: string): PlatformCredentials | null {
    const creds = this.getCredentials();
    return (creds as any)[platform.toLowerCase()] || null;
  }
}
