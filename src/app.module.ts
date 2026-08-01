import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { Employee } from './entities/employee.entity';
import { Role } from './entities/role.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get('DB_PORT', 3306),
        username: configService.get('DB_USERNAME', 'root'),
        password: configService.get('DB_PASSWORD', ''),
        database: configService.get('DB_DATABASE', 'payment_system'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
        charset: 'utf8mb4',
        logging: true,
      }),
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
    // 【关键】统一权限守卫：同时支持 @Roles 层级 + @RequirePermissions 功能点
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
})
export class AppModule {}
