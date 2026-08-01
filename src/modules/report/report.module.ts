import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { Refund } from '../../entities/refund.entity';
import { Store } from '../../entities/store.entity';
import { Employee } from '../../entities/employee.entity';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Payment, Refund, Store, Employee]),
    RbacModule, // 依赖数据范围服务
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
