import winston from 'winston';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Build transports based on environment
const transports: winston.transport[] = [];

// Console transport - always enabled in production (for serverless logs)
// and in development with colorized output
if (isProduction) {
  transports.push(
    new winston.transports.Console({
      format: logFormat
    })
  );
} else {
  // In development, use file transports + colorized console
  const DailyRotateFile = require('winston-daily-rotate-file');

  transports.push(
    new DailyRotateFile({
      filename: path.join(process.cwd(), 'logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      createSymlink: true,
      symlinkName: 'error-current.log',
    }),
    new DailyRotateFile({
      filename: path.join(process.cwd(), 'logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      createSymlink: true,
      symlinkName: 'combined-current.log',
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  );
}

const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'trisikha-api' },
  transports
});

// Security event logger (basic logging only)
export const logSecurityEvent = (event: string, details: Record<string, any>) => {
  logger.warn('SECURITY_EVENT', { event, ...details, timestamp: new Date().toISOString() });
};

/**
 * Track security event with anomaly detection
 * Use this instead of logSecurityEvent when you want automatic incident creation
 * for repeated suspicious events (rate limits, signature failures, etc.)
 */
export const trackSecurityEvent = async (
  event: string,
  details: Record<string, any>
): Promise<void> => {
  // Always log the event
  logSecurityEvent(event, details);

  // Attempt anomaly detection (async, non-blocking)
  try {
    // Dynamic import to avoid circular dependency
    const { detectAnomaly } = await import('./incident');
    await detectAnomaly({
      eventType: event,
      ip: details.ip,
      userId: details.userId,
      orderId: details.orderId,
      endpoint: details.endpoint,
      details,
    });
  } catch (err) {
    // Don't fail if anomaly detection fails
    logger.error('ANOMALY_DETECTION_ERROR', {
      error: err instanceof Error ? err.message : 'Unknown error',
      event,
    });
  }
};

// Payment logger
export const logPayment = (action: string, details: Record<string, any>) => {
  logger.info('PAYMENT', { action, ...details, timestamp: new Date().toISOString() });
};

// Order logger
export const logOrder = (action: string, details: Record<string, any>) => {
  logger.info('ORDER', { action, ...details, timestamp: new Date().toISOString() });
};

// Auth logger
export const logAuth = (action: string, details: Record<string, any>) => {
  logger.info('AUTH', { action, ...details, timestamp: new Date().toISOString() });
};

// Error logger
export const logError = (error: Error, context: Record<string, any> = {}) => {
  logger.error('ERROR', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
    timestamp: new Date().toISOString()
  });
};

export default logger;
