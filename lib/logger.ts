import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'trisikha-api' },
  transports: [
    // Error logs
    new DailyRotateFile({
      filename: path.join(process.cwd(), 'logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      createSymlink: true,
      symlinkName: 'error-current.log',
    }),

    // Combined logs
    new DailyRotateFile({
      filename: path.join(process.cwd(), 'logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      createSymlink: true,
      symlinkName: 'combined-current.log',
    }),

    // Console output in development
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ] : [])
  ]
});

// Security event logger
export const logSecurityEvent = (event: string, details: Record<string, any>) => {
  logger.warn('SECURITY_EVENT', { event, ...details, timestamp: new Date().toISOString() });
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
