import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { Refund } from '../../entities/refund.entity';
import { Employee } from '../../entities/employee.entity';
import { Merchant } from '../../entities/merchant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Payment, Refund, Employee, Merchant])],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
