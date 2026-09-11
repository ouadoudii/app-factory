const FORBIDDEN_PATHS = [/(^|\/)\.env($|\.)/i, /(^|\/)id_rsa$/i, /(^|\/)credentials?\.(json|ya?ml|txt)$/i];
const SECRET_PATTERNS = [/sk-[A-Za-z0-9_-]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /ghp_[A-Za-z0-9]{20,}/, /gsk_[A-Za-z0-9]{20,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
export type GeneratedFile = { path: string; content: string };

export function assertSafeGeneratedFiles(files: GeneratedFile[]) {
  const seen = new Set<string>();
  for (const file of files) {
    const path = file.path.replace(/^\/+/, '').replace(/\\/g, '/');
    if (!path || path.split('/').includes('..') || path.startsWith('.git/')) throw new Error(`Unsafe generated path: ${file.path}`);
    const isEnvExample = /(^|\/)\.env\.example$/i.test(path);
    if (!isEnvExample && FORBIDDEN_PATHS.some((pattern) => pattern.test(path))) throw new Error(`Secret-bearing file is forbidden: ${path}`);
    if (SECRET_PATTERNS.some((pattern) => pattern.test(file.content))) throw new Error(`Generated file appears to contain a secret: ${path}`);
    const key = path.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate generated path: ${path}`);
    seen.add(key);
  }
}
