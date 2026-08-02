/**
 * CSV 导出工具（轻量零依赖，中文列名不乱码）
 *
 * 用法：
 *   import { exportCsv } from '@/utils/csv';
 *   exportCsv(
 *     [
 *       { orderNo: 'O1', amount: 88.88, status: '已支付' },
 *       { orderNo: 'O2', amount: 10, status: '待支付' },
 *     ],
 *     {
 *       columns: { orderNo: '订单号', amount: '金额', status: '状态' },
 *       filename: '订单列表',
 *     },
 *   );
 */

export interface CsvOptions<T extends Record<string, any> = Record<string, any>> {
  /** 列名映射：{ fieldKey: 中文列名 }；不传则用对象所有 key 作为列名 */
  columns?: Partial<Record<keyof T, string>>;
  /** 列顺序（可选）；不传按 columns 顺序，或对象遍历顺序 */
  order?: (keyof T)[];
  /** 文件名，自动加时间戳和 .csv 后缀 */
  filename?: string;
  /** 千分位格式化字段，传入这些字段会自动 format 为 ￥1,234.56 */
  moneyFields?: (keyof T)[];
}

/** 单元格转义：包含逗号/引号/换行时加引号，内部引号转义两个 */
function escapeCell(value: any): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 千分位金额格式化 */
function formatMoney(v: any): string {
  const n = Number(v);
  if (Number.isNaN(n)) return String(v ?? '');
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function exportCsv<T extends Record<string, any>>(
  rows: T[],
  opts: CsvOptions<T> = {},
): void {
  if (!rows || rows.length === 0) {
    import('element-plus').then(({ ElMessage }) => ElMessage.warning('暂无数据可导出'));
    return;
  }

  const { columns, filename = 'export', moneyFields = [] } = opts;
  const fieldOrder = opts.order || (columns ? Object.keys(columns) : Object.keys(rows[0] || {}));

  const header = fieldOrder
    .map((k) => escapeCell((columns as any)?.[k] ?? String(k)))
    .join(',');

  const body = rows
    .map((row) =>
      fieldOrder
        .map((k) => {
          let v = row[k as keyof T];
          if (moneyFields.includes(k as keyof T)) {
            v = formatMoney(v);
          }
          return escapeCell(v);
        })
        .join(','),
    )
    .join('\n');

  // BOM 头（\uFEFF）让 Excel 打开中文不乱码
  const csvContent = '\uFEFF' + header + '\n' + body + '\n';

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const timestamp = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');
  a.href = url;
  a.download = `${filename}_${timestamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
