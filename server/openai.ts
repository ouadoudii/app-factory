import type { GeneratedFile } from './security';

export interface AppBlueprint {
  appName: string;
  repoName: string;
  summary: string;
  testScenarios: string[];
  files: GeneratedFile[];
}

const SYSTEM_PROMPT = `You are the builder inside a strict App Factory. Turn one business idea into a production-ready MVP web app.
Hard rules:
- Use a simple Vite + React + TypeScript stack unless the product clearly requires another web stack.
- Produce complete text files only, never binaries.
- Include package.json, README.md, .gitignore, .env.example, meaningful unit/integration tests, and Playwright browser tests under e2e/ for critical user journeys.
- package.json must include working scripts named lint, test, test:e2e, and build.
- Never include real credentials or secret values. Environment variables may appear only as names/placeholders in .env.example.
- Never skip, weaken, delete, or bypass tests merely to make the project pass.
- The UI must be understandable on mobile without onboarding knowledge.
- Prefer a focused, usable MVP over many half-built features.
The Factory itself injects factory.json and the immutable GitHub Actions quality workflow after generation.`;

function extractResponseText(data: unknown) {
  const output = (data as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }).output ?? [];
  for (const item of output) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) return content.text;
    }
  }
  return '';
}

export async function generateAppBlueprint(idea: string): Promise<AppBlueprint> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
  const model = process.env.OPENAI_MODEL || 'gpt-5.6';
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['appName', 'repoName', 'summary', 'testScenarios', 'files'],
    properties: {
      appName: { type: 'string', minLength: 2, maxLength: 80 },
      repoName: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{1,62}$' },
      summary: { type: 'string', minLength: 20, maxLength: 1000 },
      testScenarios: { type: 'array', minItems: 3, maxItems: 20, items: { type: 'string' } },
      files: {
        type: 'array', minItems: 8, maxItems: 80,
        items: {
          type: 'object', additionalProperties: false, required: ['path', 'content'],
          properties: { path: { type: 'string' }, content: { type: 'string' } }
        }
      }
    }
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      reasoning: { effort: 'high' },
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Business idea:\n${idea}` }
      ],
      text: { format: { type: 'json_schema', name: 'app_factory_blueprint', strict: true, schema } }
    })
  });

  if (!response.ok) throw new Error(`OpenAI generation failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const text = extractResponseText(await response.json());
  if (!text) throw new Error('OpenAI returned no structured blueprint.');
  return JSON.parse(text) as AppBlueprint;
}
