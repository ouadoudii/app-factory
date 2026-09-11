import type { GeneratedFile } from './security';

const API = 'https://api.github.com';

function headers() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not configured.');
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'content-type': 'application/json',
  };
}

async function gh(path: string, init: RequestInit = {}, allowed: number[] = []) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { ...headers(), ...(init.headers ?? {}) } });
  if (!response.ok && !allowed.includes(response.status)) {
    throw new Error(`GitHub API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  return { status: response.status, data: await response.json() };
}

export async function createRepository(name: string, description: string) {
  const owner = process.env.GITHUB_OWNER;
  if (!owner) throw new Error('GITHUB_OWNER is not configured.');
  const isPrivate = process.env.FACTORY_REPO_VISIBILITY !== 'public';
  const profile = await gh('/user') as { data: { login: string } };
  const route = profile.data.login.toLowerCase() === owner.toLowerCase()
    ? '/user/repos'
    : `/orgs/${encodeURIComponent(owner)}/repos`;
  const result = await gh(route, {
    method: 'POST',
    body: JSON.stringify({ name, description, private: isPrivate, auto_init: true }),
  }) as { data: { id: number; full_name: string; html_url: string; default_branch: string } };
  return result.data;
}

export async function createBranch(repo: string, base: string, branch: string) {
  const ref = await gh(`/repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`) as { data: { object: { sha: string } } };
  await gh(`/repos/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.data.object.sha }),
  });
}

export async function pushGeneratedFiles(repo: string, branch: string, files: GeneratedFile[]) {
  const ref = await gh(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`) as { data: { object: { sha: string } } };
  const baseCommit = await gh(`/repos/${repo}/git/commits/${ref.data.object.sha}`) as { data: { tree: { sha: string } } };
  const tree = await gh(`/repos/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseCommit.data.tree.sha,
      tree: files.map((file) => ({ path: file.path, mode: '100644', type: 'blob', content: file.content })),
    }),
  }) as { data: { sha: string } };
  const commit = await gh(`/repos/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: 'Bootstrap app from App Factory', tree: tree.data.sha, parents: [ref.data.object.sha] }),
  }) as { data: { sha: string } };
  await gh(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.data.sha, force: false }),
  });
  return commit.data.sha;
}

export async function createPullRequest(repo: string, head: string, base: string, appName: string) {
  const result = await gh(`/repos/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: `Bootstrap ${appName}`,
      head,
      base,
      body: 'Initial App Factory build. Do not merge until the full Factory Quality Gate is green.',
    }),
  }) as { data: { number: number; html_url: string } };
  return result.data;
}

export async function getQualityGateState(repo: string, sha: string) {
  const result = await gh(`/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=50`) as {
    data: { workflow_runs: Array<{ id: number; name: string; status: string; conclusion: string | null; html_url: string; head_sha: string }> };
  };
  const run = result.data.workflow_runs
    .filter((candidate) => candidate.name === 'Factory Quality Gate' && candidate.head_sha === sha)
    .sort((a, b) => b.id - a.id)[0];
  if (!run) return { state: 'pending' as const, message: 'GitHub Actions wartet auf den Factory Quality Gate.' };
  if (run.status !== 'completed') return { state: 'pending' as const, actionsUrl: run.html_url, message: 'Factory Quality Gate läuft.' };
  if (run.conclusion !== 'success') {
    return { state: 'failure' as const, actionsUrl: run.html_url, message: `Factory Quality Gate ist ${run.conclusion ?? 'fehlgeschlagen'}. Es wird nichts gemerged oder deployed.` };
  }
  return { state: 'success' as const, actionsUrl: run.html_url, message: 'Factory Quality Gate ist grün.' };
}

export async function ensurePullRequestMerged(repo: string, prNumber: number, headSha: string) {
  const current = await gh(`/repos/${repo}/pulls/${prNumber}`) as { data: { merged: boolean; merge_commit_sha: string | null; html_url: string } };
  if (current.data.merged) {
    if (!current.data.merge_commit_sha) throw new Error('Merged PR has no merge SHA.');
    return { sha: current.data.merge_commit_sha, url: current.data.html_url };
  }
  const merged = await gh(`/repos/${repo}/pulls/${prNumber}/merge`, {
    method: 'PUT',
    body: JSON.stringify({ sha: headSha, merge_method: 'squash', commit_title: 'Bootstrap app from App Factory' }),
  }) as { data: { merged: boolean; sha: string; message: string } };
  if (!merged.data.merged) throw new Error(`GitHub refused green merge: ${merged.data.message}`);
  return { sha: merged.data.sha, url: current.data.html_url };
}
