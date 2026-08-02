import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * 健康检查端点
 * 用于 PM2 / Nginx / Docker 健康探测，无需认证（已在 JwtAuthGuard 白名单中放行）
 */
@ApiTags('系统 - Health')
@Controller('api/health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: '健康检查' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      pid: process.pid,
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB',
      },
    };
  }
}
