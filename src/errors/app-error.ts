export type ErrorDetails = Readonly<Record<string, unknown>>;

export class AppError extends Error {
  public readonly code: string;
  public readonly details: ErrorDetails | undefined;
  public readonly expose: boolean;
  public readonly statusCode: number;

  public constructor(options: {
    code: string;
    details?: ErrorDetails;
    expose?: boolean;
    message: string;
    statusCode: number;
  }) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.details = options.details;
    this.expose = options.expose ?? options.statusCode < 500;
    this.statusCode = options.statusCode;
  }
}
