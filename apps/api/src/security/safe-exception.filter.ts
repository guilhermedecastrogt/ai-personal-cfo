import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { REQUEST_ID_HEADER } from './http-hardening.js';

const SAFE_CLIENT_ERRORS: ReadonlyMap<number, string> = new Map([
  [HttpStatus.BAD_REQUEST, 'Bad Request'],
  [HttpStatus.PAYLOAD_TOO_LARGE, 'Payload Too Large'],
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'Unsupported Media Type'],
]);
const INTERNAL_ERROR = 'Internal server error';
const LOGGED_STACK_FRAMES = 6;

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

type Responder = ServerResponse & JsonResponse;

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Responder>();
    const status = error instanceof HttpException ? error.getStatus() : statusOf(error);
    const clientMessage = SAFE_CLIENT_ERRORS.get(status);
    if (clientMessage !== undefined) {
      response.status(status).json({ statusCode: status, message: clientMessage });
      return;
    }
    if (error instanceof HttpException) {
      response.status(status).json(error.getResponse());
      return;
    }
    const request = http.getRequest<IncomingMessage>();
    this.logger.error(
      `event=unhandled-error request=${String(response.getHeader(REQUEST_ID_HEADER) ?? 'none')} method=${request.method ?? 'unknown'} error=${describeError(error)}`,
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: INTERNAL_ERROR });
  }
}

function statusOf(error: unknown): number {
  if (typeof error !== 'object' || error === null) {
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const candidate = typeof status === 'number' ? status : statusCode;
  return typeof candidate === 'number' ? candidate : HttpStatus.INTERNAL_SERVER_ERROR;
}

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'non-error';
  }
  const cause = error.cause instanceof Error ? `(${error.cause.name})` : '';
  const frames = (error.stack ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .slice(0, LOGGED_STACK_FRAMES)
    .join(' < ');
  return `${error.name}${cause} ${frames}`.trim();
}
