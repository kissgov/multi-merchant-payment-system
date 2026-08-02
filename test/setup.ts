/**
 * Jest 全局测试初始化（在测试框架安装前运行，不可使用 beforeAll/afterAll 等 Jest 全局）
 *
 * 设计要点（hermetic 测试原则）：
 * - DB_TYPE=better-sqlite3：单元/集成测试统一用 SQLite，避免依赖 MySQL。
 * - JWT_SECRET：提供足够长的测试密钥，供 JwtStrategy 启动校验通过。
 * - PAYMENT_NOTIFY_BASE_URL：提供合法占位值，避免误触发生产守卫；具体拒绝逻辑测试单独覆盖。
 * - NODE_ENV=test：关闭生产模式下的 synchronize 限制，允许测试期建表。
 *
 * 单个测试用例可在 beforeEach 中通过 process.env 覆盖这些默认值。
 */
process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'better-sqlite3';
process.env.DB_DATABASE = './data/test-payment.db';
process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters-length-aaaa';
process.env.PAYMENT_NOTIFY_BASE_URL = 'https://pay.example.com';
process.env.DB_LOG = 'false';

// 抑制测试期间 NestJS Logger 的大量 warn 输出，保持输出纯净（保留 error 便于排查）
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  const first = args[0]?.toString?.() || '';
  // 过滤掉 NestJS Logger 的 [Nest] / 模块初始化 warn 噪音
  if (first.includes('[Nest]') || first.includes('Logger]') || first.includes('初始化')) {
    return;
  }
  originalWarn.apply(console, args as any);
};
