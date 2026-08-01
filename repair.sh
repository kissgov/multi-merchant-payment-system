#!/bin/bash
# =============================================================================
# 多商户支付系统 - 线上修复脚本
# 解决问题：
#   1) 旧 node 进程占用 3000 端口（PM2 新进程无法绑定，旧代码继续服务）
#   2) 服务器运行的是【旧构建】(缺少全局 JwtAuthGuard)，导致登录后所有
#      需鉴权接口 401 "未登录或登录已过期"
#
# 用法（在宝塔面板终端执行）:
#   curl -sL https://raw.githubusercontent.com/kissgov/multi-merchant-payment-system/main/repair.sh | bash
# =============================================================================
set -e

PROJECT_DIR="/www/wwwroot/pay-system"
REPO_URL="https://github.com/kissgov/multi-merchant-payment-system.git"
BACKEND_PORT=3000
DOMAIN="pay.kxrdyf.cn"
DB_USER="payment_user"
DB_PASS="Pay@2026#Secure"
DB_NAME="payment_system"

echo "=========================================="
echo "  多商户支付系统 - 线上修复"
echo "=========================================="

# 0. 确保代码目录存在
if [ ! -d "$PROJECT_DIR/.git" ]; then
  echo "[0] 代码目录不存在，先克隆..."
  rm -rf "$PROJECT_DIR"
  git clone "$REPO_URL" "$PROJECT_DIR"
fi
cd "$PROJECT_DIR"

# 1. 停止一切相关 node 进程（PM2 守护 + 野进程）
echo "[1/7] 停止所有后端 node 进程..."
pm2 delete pay-system 2>/dev/null || true
pm2 kill 2>/dev/null || true
pkill -9 -f "dist/main.js" 2>/dev/null || true
pkill -9 -f "pay-system" 2>/dev/null || true
sleep 2
# 确保端口已释放
if command -v ss &>/dev/null; then
  if ss -ltn 2>/dev/null | grep -q ":$BACKEND_PORT "; then
    echo "  端口 $BACKEND_PORT 仍被占用，强杀..."
    fuser -k ${BACKEND_PORT}/tcp 2>/dev/null || true
    sleep 2
  fi
  ss -ltn 2>/dev/null | grep -q ":$BACKEND_PORT " && echo "  WARN 端口仍占用" || echo "  OK 端口 $BACKEND_PORT 已释放"
fi

# 2. 拉取最新代码
echo "[2/7] 拉取最新代码..."
git fetch --all
git reset --hard origin/main
echo "  当前提交: $(git log --oneline -1)"

# 3. 确保 .env 存在（保留已有 JWT_SECRET；不存在才生成）
if [ ! -f .env ]; then
  echo "[3/7] 生成 .env（首次）..."
  cat > .env << EOF
PORT=$BACKEND_PORT
NODE_ENV=production
JWT_SECRET=pms_$(openssl rand -hex 24)
JWT_EXPIRES_IN=24h
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=$DB_USER
DB_PASSWORD="$DB_PASS"
DB_DATABASE=$DB_NAME
PAYMENT_NOTIFY_BASE_URL=https://$DOMAIN
EOF
else
  echo "[3/7] 保留现有 .env（JWT_SECRET 不变）"
fi

# 4. 安装依赖 + 重新编译后端
echo "[4/7] 安装依赖 + 编译后端..."
npm install --ignore-scripts 2>&1 | tail -2
npm run build 2>&1 | tail -5
# 关键校验：新构建必须包含 JwtAuthGuard
if [ ! -f dist/common/guards/jwt-auth.guard.js ]; then
  echo "  ERR 编译产物缺少 dist/common/guards/jwt-auth.guard.js，构建失败！"
  exit 1
fi
echo "  OK 后端构建完成（含 JwtAuthGuard）"

# 5. 启动单一 PM2 实例
echo "[5/7] 启动后端（PM2 单实例）..."
pm2 start dist/main.js --name pay-system --node-args="--max-old-space-size=512"
pm2 save
echo "  等待启动 + 数据库初始化..."
sleep 8

# 6. 验证
echo "[6/7] 验证..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$BACKEND_PORT/api/auth/login \
  -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}')
echo "  登录接口 HTTP $HTTP"

# 关键验证：带 token 访问 /api/auth/me
#   旧构建 -> 401 "未登录或登录已过期"
#   新构建 -> 200
TOKEN=$(curl -s http://127.0.0.1:$BACKEND_PORT/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then
  ME=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" http://127.0.0.1:$BACKEND_PORT/api/auth/me)
  echo "  /api/auth/me (带token) HTTP $ME   <-- 200=修复成功  401=仍是旧构建"
else
  echo "  WARN 未能获取 token，请检查 pm2 logs pay-system"
fi

# 7. 列出进程
echo "[7/7] PM2 进程列表:"
pm2 list

echo ""
echo "=========================================="
echo "  修复完成"
echo "  访问: https://$DOMAIN"
echo "  账号: admin / admin123"
echo "=========================================="
