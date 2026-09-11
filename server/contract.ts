import type { AppBlueprint } from './openai';
import type { GeneratedFile } from './security';

const QUALITY_PATH = '.github/workflows/factory-quality.yml';
const QUALITY_WORKFLOW = `name: Factory Quality Gate
on:
  push:
  pull_request:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install dependencies
        run: npm install
      - name: Type and lint checks
        run: npm run lint
      - name: Unit and integration tests
        run: npm test
      - name: Production dependency audit
        run: npm audit --omit=dev --audit-level=high
      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium
      - name: Real-browser critical journeys
        run: npm run test:e2e
      - name: Production build
        run: npm run build
`;

function normalize(path: string) {
  return path.replace(/^\/+/, '').replace(/\\/g, '/');
}

function required(files: Map<string, GeneratedFile>, path: string) {
  const file = files.get(path);
  if (!file) throw new Error(`Generated app is missing required file: ${path}`);
  return file;
}

export function prepareGeneratedFiles(blueprint: AppBlueprint): GeneratedFile[] {
  const files = new Map<string, GeneratedFile>();
  for (const file of blueprint.files) files.set(normalize(file.path), { path: normalize(file.path), content: file.content });

  const gitignore = files.get('.gitignore')?.content ?? '';
  const additions: string[] = [];
  if (!/(^|\n)\.env\*(\r?\n|$)/.test(gitignore)) additions.push('.env*');
  if (!/(^|\n)!\.env\.example(\r?\n|$)/.test(gitignore)) additions.push('!.env.example');
  files.set('.gitignore', {
    path: '.gitignore',
    content: `${gitignore.trimEnd()}${gitignore.trim() ? '\n' : ''}${additions.join('\n')}${additions.length ? '\n' : ''}`,
  });

  files.set('factory.json', {
    path: 'factory.json',
    content: `${JSON.stringify({
      factoryVersion: 1,
      active: true,
      appName: blueprint.appName,
      repoName: blueprint.repoName,
      summary: blueprint.summary,
      lastImprovedAt: null,
    }, null, 2)}\n`,
  });
  files.set(QUALITY_PATH, { path: QUALITY_PATH, content: QUALITY_WORKFLOW });

  const result = [...files.values()];
  assertFactoryContract(result);
  return result;
}

export function assertFactoryContract(input: GeneratedFile[]) {
  const files = new Map(input.map((file) => [normalize(file.path), file]));
  for (const path of ['package.json', 'README.md', '.gitignore', '.env.example', 'factory.json']) required(files, path);

  const pkg = JSON.parse(required(files, 'package.json').content) as { scripts?: Record<string, string> };
  for (const script of ['lint', 'test', 'test:e2e', 'build']) {
    if (!pkg.scripts?.[script]?.trim()) throw new Error(`package.json is missing required script: ${script}`);
  }
  const scripts = Object.values(pkg.scripts ?? {}).join('\n');
  if (/--passWithNoTests/i.test(scripts)) throw new Error('Generated package scripts may not bypass tests.');

  const allTestCode = [...files.entries()]
    .filter(([path]) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path))
    .map(([, file]) => file.content)
    .join('\n');
  if (/\b(?:test|it|describe)\.skip\b/.test(allTestCode)) throw new Error('Generated app may not skip tests.');

  const hasUnit = [...files.keys()].some((path) => !path.startsWith('e2e/') && /\.(test|spec)\.[cm]?[jt]sx?$/.test(path));
  const hasBrowser = [...files.keys()].some((path) => path.startsWith('e2e/') && /\.spec\.[cm]?[jt]s$/.test(path));
  if (!hasUnit) throw new Error('Generated app must include meaningful unit or integration tests.');
  if (!hasBrowser) throw new Error('Generated app must include Playwright browser tests in e2e/.');

  const workflow = required(files, QUALITY_PATH).content;
  for (const command of ['npm run lint', 'npm test', 'npm audit --omit=dev --audit-level=high', 'npm run test:e2e', 'npm run build']) {
    if (!workflow.includes(command)) throw new Error(`Quality workflow is missing: ${command}`);
  }
}
