import Anthropic from '@anthropic-ai/sdk';

/**
 * The one way the departments reach an AI model (blueprint 11.1, "model gateway"). Anything that talks to a model
 * goes through this interface, so the tests can stand in a scripted model and a missing key simply means manual mode.
 */

export type ModelRequest = Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, 'model'> & { model?: string };

export interface ModelClient {
  /** The model asked for by default, for example claude-opus-5-5. */
  readonly model: string;
  create(request: ModelRequest): Promise<Anthropic.Beta.BetaMessage>;
}

/** Effort per kind of work (blueprint 7.4: a small spend for routine steps, more for planning and judgement). */
export type Effort = 'low' | 'medium' | 'high';

export const DEFAULT_MODEL = 'claude-opus-5-5';

/** Claude through the official SDK. The key comes from the installation's settings and never enters a prompt. */
export class ClaudeModel implements ModelClient {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string = DEFAULT_MODEL,
  ) {
    // One retry inside the call: the job queue retries later anyway, and a function on a free plan has little time.
    this.client = new Anthropic({ apiKey, maxRetries: 1, timeout: 50_000 });
  }

  async create(request: ModelRequest): Promise<Anthropic.Beta.BetaMessage> {
    return this.client.beta.messages.create({
      ...request,
      model: request.model ?? this.model,
      // If the model declines a request for safety reasons, the API answers with the right fallback model instead.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  }
}

/** US dollars per million tokens: input, output, cache read, cache write (5-minute). */
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-opus-5-5': [4, 20, 0.2, 5],
  'claude-opus-5': [5, 25, 0.5, 6.25],
  'claude-opus-4-8': [5, 25, 0.5, 6.25],
  'claude-sonnet-5-5': [2, 10, 0.1, 2.5],
  'claude-sonnet-5': [2, 10, 0.2, 2.5],
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
  'claude-fable-5-2': [8, 40, 0.2, 10],
};
// A model the table does not know is priced at the dearest rate, so the budget errs on the safe side.
const UNKNOWN: [number, number, number, number] = [10, 50, 1, 12.5];

/** What one response cost, in millionths of a US dollar. */
export function costMicros(message: Pick<Anthropic.Beta.BetaMessage, 'model' | 'usage'>): number {
  const [input, output, read, write] = PRICES[message.model] ?? UNKNOWN;
  const usage = message.usage;
  const micros =
    (usage.input_tokens ?? 0) * input +
    (usage.output_tokens ?? 0) * output +
    (usage.cache_read_input_tokens ?? 0) * read +
    (usage.cache_creation_input_tokens ?? 0) * write;
  return Math.ceil(micros);
}

export const textOf = (message: Anthropic.Beta.BetaMessage): string =>
  message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
