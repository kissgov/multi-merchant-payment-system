import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 【全局】统一响应格式（必须在过滤器之前，确保正常/异常路径都一致包装）
  app.useGlobalInterceptors(new TransformInterceptor());

  // 【全局】异常过滤器（统一错误格式，屏蔽数据库敏感信息）
  app.useGlobalFilters(new AllExceptionsFilter());

  // 【全局】验证管道（自动校验 DTO，transform 自动转换类型支持 @Type()）
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: false },
  }));

  // CORS 配置
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // 全局前缀（Swagger 和健康检查不包含）
  // 注意：当前控制器已手动写了 '/api/xxx'，暂不加全局前缀，避免重复

  // Swagger API 文档
  const config = new DocumentBuilder()
    .setTitle('多商户移动支付系统 API')
    .setDescription('支持多商户、多门店、多员工的支付宝/微信面对面收款系统')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`多商户支付系统已启动: http://localhost:${port}`);
}
bootstrap();
