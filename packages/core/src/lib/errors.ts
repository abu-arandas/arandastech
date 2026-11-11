/** An error whose message is safe to show to the caller, with the HTTP status that fits it. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string): AppError => new AppError('not_found', `${what} was not found`, 404);
export const forbidden = (message: string): AppError => new AppError('forbidden', message, 403);
export const conflict = (message: string, detail?: unknown): AppError => new AppError('conflict', message, 409, detail);
export const invalid = (message: string, detail?: unknown): AppError => new AppError('invalid', message, 422, detail);
