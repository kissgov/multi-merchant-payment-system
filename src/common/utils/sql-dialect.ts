/**
 * 跨数据库 SQL 方言辅助
 *
 * MySQL 与 SQLite 在日期格式化上的差异：
 * - MySQL: DATE_FORMAT(date, format)  —— 日期在前，格式在后
 * - SQLite: strftime(format, date)    —— 格式在前，日期在后
 *
 * 通过 DB_TYPE 环境变量切换，生产(MySQL)与云端调试(SQLite)均可运行。
 * 格式串两者通用（均支持 %Y %m %d %H 占位符）。
 */

const isSqlite = (): boolean =>
  process.env.DB_TYPE === 'sqlite' || process.env.DB_TYPE === 'better-sqlite3';

/**
 * 生成"按天"分组的日期表达式
 * @param column 如 "o.createdAt"
 */
export const dateDayExpr = (column: string): string =>
  isSqlite()
    ? `strftime('%Y-%m-%d', ${column})`
    : `DATE_FORMAT(${column}, '%Y-%m-%d')`;

/**
 * 生成"按小时"分组的日期表达式（形如 2026-08-01 14:00）
 * @param column 如 "o.createdAt"
 */
export const dateHourExpr = (column: string): string =>
  isSqlite()
    ? `strftime('%Y-%m-%d %H:00', ${column})`
    : `DATE_FORMAT(${column}, '%Y-%m-%d %H:00')`;

/**
 * 返回悲观写锁选项（用于 TypeORM findOne 的 lock 参数）。
 *
 * 跨库兼容设计：
 * - MySQL（生产）：返回 `{ mode: 'pessimistic_write' }`，行级锁防止并发退款超退。
 * - SQLite（测试/云端调试）：返回 `undefined`。SQLite 事务天然串行化，
 *   「事务内重新读取 refundedAmount 并二次校验」的逻辑在串行化下已足够安全；
 *   且 better-sqlite3 驱动不支持悲观锁，传锁会抛 LockNotSupportedOnGivenDriverError。
 *
 * 调用方需配合事务内二次校验使用：锁只保证读取到提交点稳定，真正的防超退
 * 依赖事务内重新计算 currentRemaining 并校验。
 */
export const pessimisticWriteLock = (): { mode: 'pessimistic_write' } | undefined =>
  isSqlite() ? undefined : { mode: 'pessimistic_write' };
