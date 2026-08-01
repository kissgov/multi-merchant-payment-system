/**
 * 支付渠道枚举
 * 独立文件，避免 order.entity ↔ payment.entity / refund.entity 之间的循环依赖
 * 导致 TypeORM 装饰器求值时 enum 为 undefined
 */
export enum PaymentChannel {
  ALIPAY = 'alipay',       // 支付宝
  WECHAT = 'wechat',       // 微信支付
}

/**
 * 跨数据库枚举列类型辅助函数
 * - MySQL（生产/宝塔）：使用原生 ENUM 类型
 * - SQLite（云端调试）：使用 varchar 存储（TypeORM 的 sqlite 驱动不支持 enum 类型）
 *
 * 通过启动时设置环境变量 DB_TYPE=sqlite 切换，不影响生产 MySQL 的 schema。
 */
export type EnumColType = 'enum' | 'varchar';
export const enumColType = (): EnumColType =>
  process.env.DB_TYPE === 'sqlite' || process.env.DB_TYPE === 'better-sqlite3'
    ? 'varchar'
    : 'enum';
