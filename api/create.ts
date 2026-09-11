import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireFactorySession } from '../server/auth';
import { prepareGeneratedFiles } from '../server/contract';
import { createBranch, createPullRequest, createRepository, pushGeneratedFiles } from '../server/github';
import { generateAppBlueprint } from '../server/openai';
import { assertSafeGeneratedFiles } from '../server/security';

const bodySchema = z.object({ idea: z.string().trim().min(20).max(6000) });
const BOOTSTRAP_BRANCH = 'factory/bootstrap';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!requireFactorySession(req, res)) return;

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Ungültige Geschäftsidee.' });

  try {
    const blueprint = await generateAppBlueprint(parsed.data.idea);
    const files = prepareGeneratedFiles(blueprint);
    assertSafeGeneratedFiles(files);

    const repo = await createRepository(blueprint.repoName, blueprint.summary);
    const base = repo.default_branch || 'main';
    await createBranch(repo.full_name, base, BOOTSTRAP_BRANCH);
    const headSha = await pushGeneratedFiles(repo.full_name, BOOTSTRAP_BRANCH, files);
    const pr = await createPullRequest(repo.full_name, BOOTSTRAP_BRANCH, base, blueprint.appName);

    return res.status(201).json({
      appName: blueprint.appName,
      repoName: blueprint.repoName,
      repo: repo.full_name,
      headSha,
      prNumber: pr.number,
      stage: 'testing',
      message: 'Bootstrap-PR ist offen. GitHub Actions prüft Typen, Tests, Browser-Journeys, Dependency-Audit und Production-Build. Vor Grün wird nichts gemerged oder deployed.',
      githubUrl: pr.html_url,
      actionsUrl: `${repo.html_url}/actions`,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Factory-Job fehlgeschlagen.' });
  }
}
