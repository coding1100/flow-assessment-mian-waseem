import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // If it's already a NestJS HTTP exception, let NestJS handle it
    if (exception instanceof HttpException) {
      throw exception;
    }

    // Handle PostgreSQL errors that weren't caught in services
    if (exception.code && typeof exception.code === 'string') {
      // PostgreSQL error codes start with specific prefixes
      if (
        exception.code.startsWith('23') || // Integrity constraint violation
        exception.code.startsWith('42') || // Syntax error or access rule violation
        exception.code.startsWith('40') // Transaction rollback
      ) {
        this.logger.error(
          `Unhandled database error: ${exception.code}`,
          exception.stack,
        );

        const status = HttpStatus.BAD_REQUEST;
        const message = this.getErrorMessage(exception.code, exception.message);

        response.status(status).json({
          statusCode: status,
          message,
          error: 'Bad Request',
        });
        return;
      }
    }

    // For other unhandled errors, log and return 500
    this.logger.error('Unhandled exception', exception.stack);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  }

  private getErrorMessage(code: string, defaultMessage?: string): string {
    const messages: Record<string, string> = {
      '23503': 'Invalid reference: related record does not exist',
      '23505': 'Duplicate entry: record already exists',
      '23502': 'Required field is missing',
      '23514': 'Data violates business rules',
      '42P01': 'Database table does not exist',
      '42703': 'Database column does not exist',
      '40001': 'Serialization failure',
      '40003': 'Statement completion unknown',
      '40P01': 'Deadlock detected',
    };

    return messages[code] || defaultMessage || 'Database error occurred';
  }
}

