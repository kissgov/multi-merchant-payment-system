/**
 * 退款状态（扩展为更完整的审核工作流状态）
 */
export enum RefundWorkflowStatus {
  PENDING_AUDIT = 'pending_audit', // 待审核（超过限额或角色需要审批）
  AUDIT_PASSED = 'audit_passed',   // 审核通过 - 已提交渠道退款
  AUDIT_REJECTED = 'audit_rejected', // 审核驳回
  PROCESSING = 'processing',       // 渠道处理中
  SUCCESS = 'success',             // 退款成功
  FAILED = 'failed',               // 退款失败
  CLOSED = 'closed',               // 已关闭（撤回）
}

/**
 * 退款原因代码（标准化）
 */
export const REFUND_REASON_CODES = [
  { code: 'GOODS_DEFECT', label: '商品质量问题', needApprove: false },
  { code: 'WRONG_GOODS', label: '发错/错点商品', needApprove: false },
  { code: 'USER_CHANGE_MIND', label: '顾客改变主意/不想买了', needApprove: true },
  { code: 'PRICE_MISMATCH', label: '价格异议/议价退款', needApprove: true },
  { code: 'DUPLICATE_PAY', label: '重复付款', needApprove: false },
  { code: 'WRONG_AMOUNT', label: '收款金额错误', needApprove: true },
  { code: 'SERVICE_ISSUE', label: '服务不满意', needApprove: false },
  { code: 'COUPON_PROMOTION', label: '优惠/券问题', needApprove: false },
  { code: 'OTHER', label: '其他原因', needApprove: true },
];

/** 需要审批的单笔退款金额阈值（超过此值需要店长/管理员审批） */
export const REFUND_APPROVAL_THRESHOLD = 500; // 元
