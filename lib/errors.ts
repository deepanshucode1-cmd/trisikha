import { NextResponse } from 'next/server';
import { logError, logSecurityEvent } from './logger';
import { z } from 'zod';

export function getFirstZodError(error: z.ZodError): string {
  return error.issues[0]?.message || 'Invalid request';
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleApiError(error: unknown, context: Record<string, any> = {}) {
  // Zod validation errors
  if (error instanceof z.ZodError) {
    const firstMessage = error.issues[0]?.message || 'Validation failed';
    return NextResponse.json(
      {
        error: firstMessage,
        details: error.issues
      },
      { status: 400 }
    );
  }

  // Application errors
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logError(error, context);
    } else if (error.statusCode === 401 || error.statusCode === 403) {
      logSecurityEvent('unauthorized_access', { ...context, error: error.message });
    }

    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  // Unknown errors
  logError(error as Error, context);

  return NextResponse.json(
    {
      error: process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : (error as Error).message
    },
    { status: 500 }
  );
}
