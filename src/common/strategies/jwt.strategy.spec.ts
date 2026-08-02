import { ConfigService } from '@nestjs/config';

import { JwtStrategy } from './jwt.strategy';

/**
 * R6 风险测试：JWT_SECRET 硬编码/过短拒绝
 *
 * 风险命名：若 JWT_SECRET 缺失或过短（<16 位），攻击者可暴力破解或直接伪造 token，
 *          冒充任意员工发起支付/退款。requireJwtSecret 必须在策略构造时立即抛错，
 *          让服务「拒绝启动」而非用弱密钥继续运行。
 */
describe('JwtStrategy (R6: JWT_SECRET 守卫)', () => {
  const makeConfig = (secret: string | undefined): ConfigService =>
    ({ get: jest.fn(() => secret) } as any);

  it('JWT_SECRET 缺失 → 构造时抛错（拒绝启动）', () => {
    expect(() => new JwtStrategy(makeConfig(undefined))).toThrow(/JWT_SECRET/);
  });

  it('JWT_SECRET 为空字符串 → 构造时抛错', () => {
    expect(() => new JwtStrategy(makeConfig(''))).toThrow(/JWT_SECRET/);
  });

  it('JWT_SECRET 长度不足 16 位 → 构造时抛错', () => {
    expect(() => new JwtStrategy(makeConfig('short-secret-1'))).toThrow(/JWT_SECRET/);
  });

  it('JWT_SECRET 恰好 16 位 → 构造成功', () => {
    expect(() => new JwtStrategy(makeConfig('exactly-16-chars'))).not.toThrow();
  });

  it('JWT_SECRET 足够长 → 构造成功', () => {
    const secret = 'a-very-long-and-secure-random-jwt-secret-key-32+';
    expect(() => new JwtStrategy(makeConfig(secret))).not.toThrow();
  });

  it('validate 将 JWT payload 映射为 EmployeePayload', async () => {
    const strategy = new JwtStrategy(
      makeConfig('a-very-long-and-secure-random-jwt-secret-key-32+'),
    );
    const result = await strategy.validate({
      sub: 'emp-1',
      employeeNo: 'E001',
      merchantId: 'm-1',
      storeId: 's-1',
      name: '张三',
      username: 'zhangsan',
      role: 'cashier',
      roleId: 'r-1',
    });
    expect(result).toMatchObject({
      id: 'emp-1',
      employeeNo: 'E001',
      merchantId: 'm-1',
      storeId: 's-1',
      name: '张三',
      role: 'cashier',
      roleId: 'r-1',
    });
  });
});
