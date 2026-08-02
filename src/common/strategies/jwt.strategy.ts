import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { EmployeePayload } from '../decorators/current-employee.decorator';

/**
 * 从环境变量获取 JWT_SECRET，缺失时立即抛出异常阻止启动
 * 防止使用公开已知弱密钥导致 JWT 可被伪造
 */
function requireJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET');
  if (!secret || secret.length < 16) {
    throw new Error(
      'FATAL: JWT_SECRET 环境变量未设置或长度不足16位，拒绝启动。请在 .env 中配置安全的随机密钥。',
    );
  }
  return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireJwtSecret(configService),
    });
  }

  async validate(payload: any): Promise<EmployeePayload & { roleId?: string }> {
    // JWT 载荷即作为当前用户信息
    return {
      id: payload.sub,
      employeeNo: payload.employeeNo,
      merchantId: payload.merchantId,
      storeId: payload.storeId,
      name: payload.name,
      username: payload.username,
      role: payload.role,
      roleId: payload.roleId,
    };
  }
}
