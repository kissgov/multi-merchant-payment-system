import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { Merchant } from '../../entities/merchant.entity';
import { Store } from '../../entities/store.entity';
import { Employee } from '../../entities/employee.entity';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { Refund } from '../../entities/refund.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant, Store, Employee, Order, Payment, Refund])],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
