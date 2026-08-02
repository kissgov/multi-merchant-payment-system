import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * 全局异常过滤器
 * 将所有异常统一包装为：{ code, message, data, path, timestamp }
 *  - HttpException：使用其 status 作为 code，message 保持原样
 *  - QueryFailedError：数据库异常 → 500 通用提示（避免泄露表结构）
 *  - 其它 Error：500 通用提示
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId || '-';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误，请稍后重试';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = status;
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        // ValidationPipe 返回 { message: string[] | string, error, statusCode }
        const msgArr = (res as any).message;
        if (Array.isArray(msgArr)) {
          message = msgArr[0] || '参数校验失败';
        } else if (typeof msgArr === 'string') {
          message = msgArr;
        } else if (typeof (res as any).error === 'string') {
          message = (res as any).error;
        }
      }
    } else if (exception instanceof QueryFailedError) {
      // 数据库异常：记录详细日志但对外隐藏敏感信息
      this.logger.error(
        `[${requestId}] [DB] ${(exception as any).code || 'UNKNOWN'}: ${exception.message}`,
        (exception as any).stack,
      );
      message = '数据操作失败，请重试';
      code = HttpStatus.BAD_REQUEST;
      status = HttpStatus.BAD_REQUEST;
    } else if (exception instanceof Error) {
      this.logger.error(
        `[${requestId}] [Unhandled] ${exception.name}: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(`[${requestId}] [UnknownException] ${JSON.stringify(exception)}`);
    }

    response.status(status).json({
      code,
      message,
      data: null,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
}
