import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderSchedulerService } from './order-scheduler.service';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { Refund } from '../../entities/refund.entity';
import { Employee } from '../../entities/employee.entity';
import { Merchant } from '../../entities/merchant.entity';
import { RefundModule } from '../refund/refund.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Payment, Refund, Employee, Merchant]),
    RefundModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderSchedulerService],
  exports: [OrderService],
})
export class OrderModule {}
