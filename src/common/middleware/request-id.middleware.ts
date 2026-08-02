import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * 请求链路追踪中间件
 * - 优先使用客户端传入的 X-Request-Id（便于前端/网关关联）
 * - 无则生成 UUID v4
 * - 写入响应头 X-Request-Id，并挂载到 req.requestId 供拦截器/过滤器使用
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'] as string | undefined;
    const requestId =
      incoming && /^[a-zA-Z0-9_-]{8,64}$/.test(incoming)
        ? incoming
        : crypto.randomUUID();

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
