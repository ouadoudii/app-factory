import { describe, expect, it } from 'vitest';
import { validateIdea } from '../src/lib/validation';

describe('business idea validation', () => {
  it('accepts a meaningful idea', () => {
    expect(validateIdea({ idea: 'Eine App für Handwerker, die Angebote aus Fotos vorbereitet.' })).toEqual({
      ok: true,
      idea: 'Eine App für Handwerker, die Angebote aus Fotos vorbereitet.',
    });
  });

  it('rejects trivial ideas', () => {
    expect(validateIdea({ idea: 'Todo App' }).ok).toBe(false);
  });
});
