// Prompt, output schema and clean-up for the `training-generator` Edge Function.
// Pure module: shared with the Jest suite, so no Deno or React Native imports.
// Self-contained: Deno needs file extensions on relative imports and the app's tsc forbids them.

export const MAX_SPECS_CHARS = 3000;
export const QUESTIONS_PER_RUN = 3;

export interface TrainingDraft {
  topic: string;
  question: string;
  answer: string;
}

export const TRAINING_SYSTEM_PROMPT = [
  'You write quick-fire training questions for Samsung retail field staff who demo Galaxy devices to customers in UK phone stores.',
  '',
  'Each question:',
  '- Tests one fact a customer would care about, the kind of thing staff say on the shop floor.',
  '- Has a short answer (one or two sentences) that staff can read in a few seconds and repeat to a customer.',
  '- Uses plain British English. No emojis, no exclamation marks, no markdown.',
  '- Never uses an em dash or an en dash. Use commas, full stops or brackets instead.',
  '',
  'Accuracy:',
  '- Base every question only on the specs the admin gives you. Never invent figures, prices, release dates or features.',
  '- If the specs do not support three distinct questions, ask about the same facts from a different angle (for example how to explain it to a customer) rather than guess.',
  '',
  'Topic: a short label of one to three words, such as the device name or the feature (for example "Galaxy S26 Ultra" or "Camera").',
].join('\n');

export function buildTrainingPrompt(specs: string): string {
  return [`Write exactly ${QUESTIONS_PER_RUN} new question and answer pairs from these specs.`, '', '<specs>', specs.trim(), '</specs>'].join('\n');
}

/** JSON schema for output_config.format, so the reply is always parseable. */
export const TRAINING_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          question: { type: 'string' },
          answer: { type: 'string' },
        },
        required: ['topic', 'question', 'answer'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
} as const;

export function validateSpecs(input: unknown): string {
  const specs = input && typeof input === 'object' && typeof (input as { specs?: unknown }).specs === 'string' ? (input as { specs: string }).specs.trim() : '';
  if (!specs) throw new Error('Type the latest specs for the AI to work from');
  if (specs.length > MAX_SPECS_CHARS) throw new Error(`Specs are too long (max ${MAX_SPECS_CHARS} characters)`);
  return specs;
}

/** Em and en dashes become a hyphen in ranges and a comma elsewhere. */
const noDashes = (text: string) => text.replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2').replace(/\s*[\u2013\u2014]\s*/g, ', ');

const clean = (v: unknown, max: number) => (typeof v === 'string' ? noDashes(v).replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Parses the model's JSON into at most three tidy drafts, dropping blanks and repeats. */
export function parseTrainingOutput(raw: string): TrainingDraft[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('The AI reply was not valid JSON');
  }
  const list = data && typeof data === 'object' && Array.isArray((data as { questions?: unknown }).questions) ? (data as { questions: unknown[] }).questions : [];
  const seen = new Set<string>();
  const drafts: TrainingDraft[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const draft = { topic: clean(r.topic, 40) || 'Galaxy', question: clean(r.question, 400), answer: clean(r.answer, 1000) };
    const key = draft.question.toLowerCase();
    if (draft.question.length < 3 || !draft.answer || seen.has(key)) continue;
    seen.add(key);
    drafts.push(draft);
    if (drafts.length === QUESTIONS_PER_RUN) break;
  }
  return drafts;
}
