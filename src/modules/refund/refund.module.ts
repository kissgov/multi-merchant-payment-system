import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefundController } from './refund.controller';
import { RefundService } from './refund.service';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { Refund } from '../../entities/refund.entity';
import { Employee } from '../../entities/employee.entity';
import { Merchant } from '../../entities/merchant.entity';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Payment, Refund, Employee, Merchant]),
    AuditModule,
    RbacModule,
  ],
  controllers: [RefundController],
  providers: [RefundService],
  exports: [RefundService],
})
export class RefundModule {}
