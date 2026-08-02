import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { StoreModule } from './modules/store/store.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { PaymentModule } from './modules/payment/payment.module';
import { OrderModule } from './modules/order/order.module';
import { ReportModule } from './modules/report/report.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { AuditModule } from './modules/audit/audit.module';
import { RefundModule } from './modules/refund/refund.module';
import { PermissionGuard } from './common/guards/permission.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { Employee } from './entities/employee.entity';
import { Role } from './entities/role.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // 定时任务模块（订单超时自动关闭等 Cron 任务）
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbType = (configService.get('DB_TYPE') || 'mysql') as 'mysql' | 'better-sqlite3' | 'sqlite';
        const common = {
          type: dbType,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: true,
          logging: configService.get('DB_LOG') === 'false' ? false : true,
        } as any;
        if (dbType === 'better-sqlite3' || dbType === 'sqlite') {
          // 云端无 MySQL 时使用 SQLite 本地调试
          return {
            ...common,
            type: 'sqlite' as const,
            database: configService.get('DB_DATABASE') || './data/payment.db',
          };
        }
        return {
          ...common,
          host: configService.get('DB_HOST', 'localhost'),
          port: configService.get('DB_PORT', 3306),
          username: configService.get('DB_USERNAME', 'root'),
          password: configService.get('DB_PASSWORD', ''),
          database: configService.get('DB_DATABASE', 'payment_system'),
          charset: 'utf8mb4',
        };
      },
      inject: [ConfigService],
    }),
    // 给 PermissionGuard 注入 Repository（APP_GUARD 是全局的，需要实体也在全局注册）
    TypeOrmModule.forFeature([Employee, Role]),

    AuthModule,
    MerchantModule,
    StoreModule,
    EmployeeModule,
    PaymentModule,
    OrderModule,
    ReportModule,
    RbacModule,
    AuditModule,
    RefundModule,
  ],
  providers: [
    // 【关键】全局守卫执行顺序 = 注册顺序：
    //   1) JwtAuthGuard   —— 先完成 JWT 认证，注入 req.user（公开接口放行）
    //   2) PermissionGuard —— 再做角色/功能权限判断（此时 req.user 已就绪）
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
})
export class AppModule {}
