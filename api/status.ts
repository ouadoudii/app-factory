import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireFactorySession } from '../server/auth';
import { ensurePullRequestMerged, getQualityGateState } from '../server/github';
import { ensureVercelProject, getProductionDeployment } from '../server/vercel';

const bodySchema = z.object({
  appName: z.string().min(1).max(80),
  repoName: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  headSha: z.string().regex(/^[a-f0-9]{40}$/i),
  prNumber: z.number().int().positive(),
  productionSha: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!requireFactorySession(req, res)) return;
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Ungültiger Factory-Job.' });
  const job = parsed.data;
  const owner = process.env.GITHUB_OWNER;
  if (owner && !job.repo.toLowerCase().startsWith(`${owner.toLowerCase()}/`)) {
    return res.status(400).json({ error: 'Repository gehört nicht zum konfigurierten Factory-Owner.' });
  }

  try {
    const gate = await getQualityGateState(job.repo, job.headSha);
    if (gate.state === 'pending') return res.status(200).json({ ...job, stage: 'testing', message: gate.message, actionsUrl: gate.actionsUrl });
    if (gate.state === 'failure') return res.status(200).json({ ...job, stage: 'blocked', message: gate.message, actionsUrl: gate.actionsUrl });

    const merge = job.productionSha
      ? { sha: job.productionSha, url: `https://github.com/${job.repo}/pull/${job.prNumber}` }
      : await ensurePullRequestMerged(job.repo, job.prNumber, job.headSha);
    const project = await ensureVercelProject(job.repoName, job.repo);
    const deployment = await getProductionDeployment(project.id, merge.sha);

    if (deployment.state === 'failure') {
      return res.status(200).json({ ...job, productionSha: merge.sha, stage: 'blocked', message: deployment.message, actionsUrl: gate.actionsUrl, githubUrl: merge.url });
    }
    if (deployment.state === 'pending') {
      return res.status(200).json({ ...job, productionSha: merge.sha, stage: 'vercel', message: deployment.message, actionsUrl: gate.actionsUrl, githubUrl: merge.url });
    }

    return res.status(200).json({
      ...job,
      productionSha: merge.sha,
      stage: 'ready',
      message: 'Alle Gates sind grün, der Bootstrap-PR ist gemerged und Vercel Production ist READY. Die App ist jetzt für die Factory Improvement-Loop aktiv.',
      actionsUrl: gate.actionsUrl,
      githubUrl: merge.url,
      vercelUrl: deployment.url,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ...job, stage: 'blocked', error: error instanceof Error ? error.message : 'Statusprüfung fehlgeschlagen.' });
  }
}
