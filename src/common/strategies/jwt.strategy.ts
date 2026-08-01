import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { EmployeePayload } from '../decorators/current-employee.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET', 'payment-system-secret-key-change-in-production'),
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
