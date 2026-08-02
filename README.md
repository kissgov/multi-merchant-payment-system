# 多商户多门店多员工移动支付收款系统

一套面向多商户、多门店、多员工的移动支付收款管理系统，支持支付宝、微信面对面收款，具备完整的退款流程和RBAC权限管理体系。PC端管理后台同时支持Web浏览器和Electron桌面应用两种运行方式。

## 技术栈

### 后端
- **框架**: NestJS 10 + TypeScript 5
- **数据库**: MySQL 8 + TypeORM 0.3
- **认证**: JWT + Passport + bcrypt
- **支付集成**: alipay-sdk (支付宝)、自研微信支付V3客户端 (Node crypto + axios)
- **API文档**: Swagger (@nestjs/swagger)

### 前端（PC管理后台）
- **框架**: Vue 3.4 + TypeScript + Vite 5
- **UI组件**: Element Plus 2.6 + @element-plus/icons-vue
- **状态管理**: Pinia 2.1
- **路由**: Vue Router 4
- **图表**: ECharts 5 + vue-echarts
- **HTTP**: Axios
- **桌面应用**: Electron 29 + electron-builder
- **其他**: dayjs、nprogress、js-cookie、qrcode、lodash-es

## 目录结构

```
/workspace
├── src/                          # 后端NestJS源码
│   ├── entities/                 # TypeORM数据库实体
│   │   ├── merchant.entity.ts    # 商户实体（含支付配置）
│   │   ├── store.entity.ts       # 门店实体
│   │   ├── employee.entity.ts    # 员工实体
│   │   ├── role.entity.ts        # 角色实体
│   │   ├── menu.entity.ts        # 菜单/权限实体
│   │   ├── order.entity.ts       # 订单实体
│   │   ├── payment.entity.ts     # 支付流水实体
│   │   ├── refund.entity.ts      # 退款记录实体
│   │   └── audit-log.entity.ts   # 审计日志实体
│   ├── modules/
│   │   └── payment/
│   │       └── payment.service.ts # 支付核心服务（支付宝+微信被扫/主扫/查单）
│   ├── common/
│   │   └── guards/
│   │       └── permission.guard.ts # 统一RBAC权限守卫
│   ├── app.module.ts
│   └── main.ts
├── frontend/                     # 前端Vue3 + Electron项目
│   ├── src/
│   │   ├── router/index.ts       # 路由 + 动态菜单 + 登录守卫
│   │   ├── views/
│   │   │   └── payment/cashier.vue # 收款台（支付宝/微信扫码/被扫）
│   │   └── ...
│   ├── electron/
│   │   ├── main.js               # Electron主进程（窗口/菜单/IPC）
│   │   └── preload.js
│   ├── vite.config.ts
│   └── package.json
├── package.json                  # 后端依赖
├── tsconfig.json
├── nest-cli.json
└── .env.example                  # 后端环境变量示例
```

## 快速开始

### 1. 数据库准备
启动 MySQL 8.0+，创建数据库：
```sql
CREATE DATABASE payment_system DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. 后端启动
```bash
# 进入项目根目录
cd /workspace

# 拷贝并修改环境变量
cp .env.example .env
# 编辑 .env，配置数据库连接和支付密钥

# 安装依赖
npm install

# 开发模式启动（带热重载，监听 3000 端口）
npm run start:dev

# 生产构建并启动
npm run build
npm run start:prod
```

访问 `http://localhost:3000/api/docs` 查看 Swagger API 文档。

### 3. 前端启动（Web浏览器模式）
```bash
cd /workspace/frontend

# 安装依赖
npm install

# 开发模式（默认 5173 端口，Vite 代理 /api -> 后端 3000）
npm run dev

# 生产构建（产物输出到 frontend/dist）
npm run build

# 本地预览构建产物
npm run preview
```

访问 `http://localhost:5173` 打开管理后台。

### 4. 前端启动（Electron桌面应用模式）
```bash
cd /workspace/frontend

# 开发模式：构建 + 启动Electron窗口
npm run electron:dev

# 打包 Windows x64 安装包
npm run electron:build:win

# 打包 macOS 安装包
npm run electron:build:mac

# 打包当前平台
npm run electron:build
```

桌面应用安装后首次启动可在 **系统设置 → 服务器配置** 中指定后端 API 地址（地址保存在本地 localStorage）。

## 主要功能

- **商户/门店/员工管理**：多租户数据隔离，商户下可建多个门店、多名员工。
- **RBAC 权限管理**：角色、菜单、功能权限点、数据权限范围（全商户 / 本门店 / 仅本人）。
- **收款台**：支持 **支付宝/微信 主扫（动态收款码）** 与 **被扫（扫码枪/付款码）**。
- **订单管理**：订单列表、详情、按商户/门店/员工/时间筛选、导出。
- **退款管理**：全额/部分退款、退款流水记录、退款状态同步。
- **仪表盘**：交易金额、订单数、退款率、渠道占比等多维度图表统计。
- **审计日志**：登录、敏感操作、支付与退款变更留痕。

## 权限守卫说明

`PermissionGuard`（[src/common/guards/permission.guard.ts](src/common/guards/permission.guard.ts)）支持两种注解组合校验：
- `@Roles('MERCHANT_ADMIN','STORE_MANAGER')` 基于角色层级
- `@RequirePermissions('order:list','refund:create')` 基于功能权限点

二者同时存在时，满足其一即可通过。

## 环境变量示例（.env）

```env
# 服务
PORT=3000
NODE_ENV=development

# 数据库
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=123456
DB_DATABASE=payment_system

# JWT
JWT_SECRET=请替换为强随机字符串
JWT_EXPIRES_IN=8h

# 支付宝（商户维度配置保存在 merchant 表中，此处仅作默认/示例）
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do

# 微信支付V3
WXPAY_MCH_ID=
WXPAY_APP_ID=
WXPAY_API_V3_KEY=
WXPAY_MCH_SERIAL_NO=
WXPAY_PRIVATE_KEY_PATH=./certs/apiclient_key.pem
```

## License

MIT
