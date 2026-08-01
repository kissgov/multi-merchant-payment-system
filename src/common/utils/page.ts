/**
 * 分页参数解析工具
 *
 * 解决问题：全局 ValidationPipe 开启 transform 后，缺失的 @Query('page') number
 * 类型参数会被转换为 NaN（Number(undefined)），从而绕过服务层的默认值，
 * 导致 TypeORM .skip(NaN) 抛出 "Provided skip value is not a number"。
 *
 * 本工具统一将 page/pageSize 强制为安全整数，兼容 undefined / NaN / 字符串。
 */
export interface ParsedPagination {
  page: number;
  pageSize: number;
  skip: number;
}

export function parsePagination(
  page?: number | string | null,
  pageSize?: number | string | null,
  options?: { maxPageSize?: number; defaultPageSize?: number },
): ParsedPagination {
  const max = options?.maxPageSize ?? 200;
  const def = options?.defaultPageSize ?? 20;

  const p = Number(page);
  const ps = Number(pageSize);

  const safePage = Number.isFinite(p) && p > 0 ? Math.floor(p) : 1;
  const safePageSize =
    Number.isFinite(ps) && ps > 0 ? Math.min(Math.floor(ps), max) : def;

  return {
    page: safePage,
    pageSize: safePageSize,
    skip: (safePage - 1) * safePageSize,
  };
}
