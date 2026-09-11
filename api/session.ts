import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearFactorySession, isFactoryAuthenticated, setFactorySession, verifyFactoryAccessKey } from '../server/auth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.status(200).json({ authenticated: isFactoryAuthenticated(req) });
  if (req.method === 'DELETE') {
    clearFactorySession(res);
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const key = typeof req.body?.key === 'string' ? req.body.key : '';
  if (!verifyFactoryAccessKey(key)) return res.status(401).json({ error: 'Factory-Key ist falsch.' });
  setFactorySession(res);
  return res.status(200).json({ authenticated: true });
}
