import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

/**
 * 统一响应格式拦截器
 * 将所有控制器返回值包装为：{ code: 200, message: 'success', data: T }
 *
 * 特殊情况：
 *  - 如果控制器显式返回 { code, message, data } 结构（且 code 为数字），则原样返回（保持灵活）
 *  - 如果控制器返回 null / undefined → data: null
 */
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
  timestamp?: string;
  requestId?: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const http = context.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<{ requestId?: string }>();

    return next.handle().pipe(
      map((value) => {
        // 已经是标准结构（自定义 code/message）→ 原样透传
        if (
          value !== null &&
          typeof value === 'object' &&
          'code' in value &&
          typeof (value as any).code === 'number' &&
          'message' in value &&
          'data' in value
        ) {
          return {
            code: (value as any).code,
            message: (value as any).message,
            data: (value as any).data,
            timestamp: new Date().toISOString(),
            requestId: req.requestId,
          };
        }

        // 否则包装为成功响应，HTTP 状态码使用 Nest 已设置的值或默认 200
        const code = res.statusCode >= 400 ? res.statusCode : HttpStatus.OK;
        return {
          code,
          message: 'success',
          data: value ?? null,
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        };
      }),
    );
  }
}
