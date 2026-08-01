#!/bin/bash
# 多商户支付系统 - GitHub 源码部署脚本
# 在宝塔面板终端中执行: bash /tmp/deploy.sh
# 或: curl -sL https://raw.githubusercontent.com/kissgov/multi-merchant-payment-system/main/deploy.sh | bash

set -e

# ============ 配置区 ============
PROJECT_DIR="/www/wwwroot/pay-system"
REPO_URL="https://github.com/kissgov/multi-merchant-payment-system.git"
DB_NAME="payment_system"
DB_USER="payment_user"
DB_PASS="Pay@2026#Secure"
BACKEND_PORT=3000
DOMAIN="pay.kxrdyf.cn"
# ================================================

echo "=========================================="
echo "  多商户支付系统 - GitHub 源码部署"
echo "=========================================="

# 1. 检查环境
echo "[1/9] 检查运行环境..."
command -v node &>/dev/null || { echo "  ERR Node.js 未安装"; exit 1; }
command -v git &>/dev/null || { echo "  ERR Git 未安装"; exit 1; }
command -v pm2 &>/dev/null || { echo "  安装 PM2..."; npm install -g pm2; }
echo "  OK Node $(node -v), Git $(git --version), PM2 $(pm2 -v)"

# 2. 克隆/更新代码
echo "[2/9] 获取代码..."
if [ -d "$PROJECT_DIR/.git" ]; then
  cd "$PROJECT_DIR"
  git fetch --all
  git reset --hard origin/main
  echo "  OK 代码已更新"
else
  rm -rf "$PROJECT_DIR"
  git clone "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
  echo "  OK 代码已克隆"
fi

# 3. 创建 .env
echo "[3/9] 生成 .env 配置..."
cat > .env << EOF
PORT=$BACKEND_PORT
NODE_ENV=production
JWT_SECRET=pms_$(head -c 32 /dev/urandom | xxd -p 2>/dev/null || openssl rand -hex 16)_$(date +%s)
JWT_EXPIRES_IN=24h
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=$DB_USER
DB_PASSWORD="$DB_PASS"
DB_DATABASE=$DB_NAME
PAYMENT_NOTIFY_BASE_URL=https://$DOMAIN
EOF
echo "  OK .env 已生成"

# 4. 安装后端依赖
echo "[4/9] 安装后端依赖..."
npm install --ignore-scripts 2>&1 | tail -3
echo "  OK 后端依赖安装完成"

# 5. 编译后端
echo "[5/9] 编译后端 TypeScript..."
npm run build 2>&1 | tail -5
echo "  OK 后端编译完成"

# 6. 启动后端（首次启动会自动建表 + 初始化菜单/角色）
echo "[6/9] 启动后端（自动建表 + 初始化 RBAC）..."
pm2 delete pay-system 2>/dev/null || true
pm2 start dist/main.js --name pay-system --node-args="--max-old-space-size=512"
pm2 save
echo "  等待数据库初始化..."
sleep 5

# 7. 种子数据（创建商户 + 管理员）
echo "[7/9] 创建初始商户和管理员账号..."
DB_TYPE=mysql DB_HOST=127.0.0.1 DB_USERNAME=$DB_USER DB_PASSWORD="$DB_PASS" DB_DATABASE=$DB_NAME node seed.js 2>&1 || echo "  WARN 种子脚本执行失败，可能已存在"
echo "  OK 种子数据完成"

# 8. 构建前端
echo "[8/9] 构建前端..."
cd frontend
npm install --ignore-scripts 2>&1 | tail -3
npm run build 2>&1 | tail -5
echo "  OK 前端构建完成: $PROJECT_DIR/frontend/dist"

# 9. 验证
echo "[9/9] 验证部署..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$BACKEND_PORT/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "  OK 后端登录接口正常 (HTTP $HTTP_CODE)"
else
  echo "  WARN 后端登录接口返回 HTTP $HTTP_CODE，请检查 pm2 logs pay-system"
fi

cd "$PROJECT_DIR"
echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo "  后端 PM2 进程: pay-system (端口 $BACKEND_PORT)"
echo "  前端静态文件: $PROJECT_DIR/frontend/dist"
echo "  登录账号: admin / admin123"
echo ""
echo "  Nginx 配置:"
echo "    域名: $DOMAIN"
echo "    根目录: $PROJECT_DIR/frontend/dist"
echo "    反向代理: /api -> http://127.0.0.1:$BACKEND_PORT"
echo "=========================================="
