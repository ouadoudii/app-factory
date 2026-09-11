import { expect, test } from '@playwright/test';

async function authenticated(page: import('@playwright/test').Page) {
  await page.route('**/api/session', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) });
    }
    return route.fallback();
  });
}

test('factory is protected before idea form is exposed', async ({ page }) => {
  await page.route('**/api/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }) }));
  await page.goto('/');
  await expect(page.getByLabel('Factory-Key')).toBeVisible();
  await expect(page.getByLabel('Geschäftsidee')).toHaveCount(0);
});

test('authenticated intake explains strict contract', async ({ page }) => {
  await authenticated(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Eine Idee rein/i })).toBeVisible();
  await expect(page.getByText('Tests vor Merge')).toBeVisible();
  await expect(page.getByText('Secrets nie im Repo')).toBeVisible();
  await expect(page.getByText('Vercel erst nach Grün')).toBeVisible();
});

test('short ideas are rejected before API call', async ({ page }) => {
  await authenticated(page);
  await page.goto('/');
  await page.getByLabel('Geschäftsidee').fill('Todo App');
  await page.getByRole('button', { name: 'App erstellen' }).click();
  await expect(page.getByRole('alert')).toContainText('mindestens 20 Zeichen');
});

test('green remote pipeline becomes live without second action', async ({ page }) => {
  await authenticated(page);
  const repo = 'ouadoudii/quote-pilot';
  const headSha = 'a'.repeat(40);
  await page.route('**/api/create', (route) => route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ appName: 'Quote Pilot', repoName: 'quote-pilot', repo, headSha, prNumber: 7, stage: 'testing', message: 'Quality Gate läuft.', githubUrl: 'https://github.com/ouadoudii/quote-pilot/pull/7', actionsUrl: 'https://github.com/ouadoudii/quote-pilot/actions' }),
  }));
  await page.route('**/api/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ appName: 'Quote Pilot', repoName: 'quote-pilot', repo, headSha, productionSha: 'b'.repeat(40), prNumber: 7, stage: 'ready', message: 'Alle Gates sind grün.', githubUrl: 'https://github.com/ouadoudii/quote-pilot/pull/7', actionsUrl: 'https://github.com/ouadoudii/quote-pilot/actions/runs/1', vercelUrl: 'https://quote-pilot.vercel.app' }),
  }));

  await page.goto('/');
  await page.getByLabel('Geschäftsidee').fill('Eine App für Handwerker, die aus Baustellenfotos automatisch Angebotsentwürfe vorbereitet.');
  await page.getByRole('button', { name: 'App erstellen' }).click();
  await expect(page.getByText('Quote Pilot')).toBeVisible();
  await expect(page.getByText('Alle Gates sind grün.')).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('link', { name: 'Live App' })).toHaveAttribute('href', 'https://quote-pilot.vercel.app');
});
