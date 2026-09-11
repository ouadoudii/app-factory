const API = 'https://api.vercel.com';

function authHeaders() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN is not configured.');
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

function withTeam(path: string) {
  const url = new URL(path, API);
  const teamId = process.env.VERCEL_TEAM_ID;
  if (teamId) url.searchParams.set('teamId', teamId);
  return url;
}

export async function ensureVercelProject(name: string, repoFullName: string) {
  const lookup = await fetch(withTeam(`/v9/projects/${encodeURIComponent(name)}`), { headers: authHeaders() });
  if (lookup.ok) return lookup.json() as Promise<{ id: string; name: string }>;
  if (lookup.status !== 404) throw new Error(`Vercel project lookup failed (${lookup.status}).`);

  const response = await fetch(withTeam('/v11/projects'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, framework: 'vite', gitRepository: { type: 'github', repo: repoFullName } }),
  });
  if (response.ok) return response.json() as Promise<{ id: string; name: string }>;
  if (response.status === 409) {
    const retry = await fetch(withTeam(`/v9/projects/${encodeURIComponent(name)}`), { headers: authHeaders() });
    if (retry.ok) return retry.json() as Promise<{ id: string; name: string }>;
  }
  throw new Error(`Vercel project creation failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
}

export async function getProductionDeployment(projectId: string, sha: string) {
  const url = withTeam('/v6/deployments');
  url.searchParams.set('projectId', projectId);
  url.searchParams.set('target', 'production');
  url.searchParams.set('sha', sha);
  url.searchParams.set('limit', '5');
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) throw new Error(`Vercel deployment lookup failed (${response.status}).`);
  const data = await response.json() as { deployments?: Array<{ uid: string; state: string; url: string | null }> };
  const deployment = data.deployments?.[0];
  if (!deployment) return { state: 'pending' as const, message: 'Vercel wartet auf den Production-Deploy.' };
  if (deployment.state === 'READY' && deployment.url) return { state: 'ready' as const, url: `https://${deployment.url}`, deploymentId: deployment.uid };
  if (['ERROR', 'CANCELED', 'BLOCKED'].includes(deployment.state)) return { state: 'failure' as const, message: `Vercel Production ist ${deployment.state}.`, deploymentId: deployment.uid };
  return { state: 'pending' as const, message: `Vercel Production ist ${deployment.state}.`, deploymentId: deployment.uid };
}
