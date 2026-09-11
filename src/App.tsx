import { FormEvent, useEffect, useState } from 'react';
import { validateIdea } from './lib/validation';

type Stage = 'testing' | 'vercel' | 'ready' | 'blocked';
type Job = {
  appName: string;
  repoName: string;
  repo: string;
  headSha: string;
  prNumber: number;
  productionSha?: string;
  stage: Stage;
  message: string;
  githubUrl?: string;
  actionsUrl?: string;
  vercelUrl?: string;
};
type AuthState = 'checking' | 'locked' | 'authenticated';

export function App() {
  const [auth, setAuth] = useState<AuthState>('checking');
  const [accessKey, setAccessKey] = useState('');
  const [idea, setIdea] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    fetch('/api/session', { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((data) => setAuth(data.authenticated ? 'authenticated' : 'locked'))
      .catch(() => setAuth('locked'));
  }, []);

  useEffect(() => {
    if (!job || !['testing', 'vercel'].includes(job.stage)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/status', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(job),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Statusprüfung fehlgeschlagen.');
        if (!cancelled) setJob(data);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Statusprüfung fehlgeschlagen.');
      }
    }, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [job]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: accessKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Anmeldung fehlgeschlagen.');
      setAccessKey('');
      setAuth('authenticated');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateIdea({ idea });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setBusy(true);
    setError('');
    setJob(null);
    try {
      const response = await fetch('/api/create', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idea: validation.idea }),
      });
      const data = await response.json();
      if (response.status === 401) setAuth('locked');
      if (!response.ok) throw new Error(data.error ?? 'Factory-Job konnte nicht gestartet werden.');
      setJob(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="factory-title">
        <p className="eyebrow">APP FACTORY</p>
        <h1 id="factory-title">Eine Idee rein. Eine getestete App raus.</h1>
        <p className="lede">ChatGPT baut den MVP, GitHub erzwingt die Quality-Gates, Vercel kommt erst nach Grün – danach übernimmt die Improvement-Loop.</p>
      </section>

      {auth === 'checking' && <section className="card"><p>Factory-Zugang wird geprüft …</p></section>}

      {auth === 'locked' && (
        <form className="card" onSubmit={login}>
          <label htmlFor="factory-key">Factory-Key</label>
          <input id="factory-key" type="password" autoComplete="current-password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} placeholder="Einmal anmelden" disabled={busy} />
          <p className="hint">Der Zugang bleibt als sicherer HttpOnly-Cookie im Browser. Danach gibst du nur noch Geschäftsideen ein.</p>
          <button disabled={busy || !accessKey} type="submit">Factory öffnen</button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      )}

      {auth === 'authenticated' && (
        <form className="card" onSubmit={submit}>
          <label htmlFor="idea">Geschäftsidee</label>
          <textarea id="idea" value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="Zum Beispiel: Eine App, die ..." rows={8} disabled={busy} />
          <div className="rules" aria-label="Factory-Regeln">
            <span>✓ Branch + PR</span><span>✓ Tests vor Merge</span><span>✓ Secrets nie im Repo</span><span>✓ Vercel erst nach Grün</span>
          </div>
          <button disabled={busy || Boolean(job && ['testing', 'vercel'].includes(job.stage))} type="submit">{busy ? 'Factory baut …' : 'App erstellen'}</button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      )}

      {job && (
        <section className="card result" aria-live="polite">
          <p className="eyebrow">{job.stage.toUpperCase()}</p>
          <h2>{job.appName}</h2>
          <p>{job.message}</p>
          <div className="links">
            {job.githubUrl && <a href={job.githubUrl} target="_blank" rel="noreferrer">GitHub PR</a>}
            {job.actionsUrl && <a href={job.actionsUrl} target="_blank" rel="noreferrer">Build</a>}
            {job.vercelUrl && <a href={job.vercelUrl} target="_blank" rel="noreferrer">Live App</a>}
          </div>
        </section>
      )}
    </main>
  );
}
