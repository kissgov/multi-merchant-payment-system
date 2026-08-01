#!/bin/bash
# 多商户支付系统 - 一键部署脚本
# 在宝塔面板终端中执行: cd /www/wwwroot/payment-system && bash deploy.sh

set -e

# ============ 配置区 ============
PROJECT_DIR="/www/wwwroot/payment-system"
DB_NAME="payment_system"
DB_USER="payment_user"
DB_PASS="Pay@2026#Secure"
DB_ROOT_PASS=""  # 留空则尝试从宝塔读取
BACKEND_PORT=3000
SERVER_IP="47.99.51.83"
# ================================

echo "=========================================="
echo "  多商户支付系统 - 部署脚本"
echo "=========================================="

# 1. 检查Node.js
echo "[1/8] 检查 Node.js..."
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  echo "  OK Node.js: $NODE_VER"
else
  echo "  Node.js 未安装，正在安装..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
fi

# 2. 安装PM2
echo "[2/8] 检查 PM2..."
if command -v pm2 &>/dev/null; then
  echo "  OK PM2 已安装"
else
  echo "  正在安装 PM2..."
  npm install -g pm2
fi

# 3. 创建数据库
echo "[3/8] 创建 MySQL 数据库..."
if [ -z "$DB_ROOT_PASS" ]; then
  DB_ROOT_PASS=$(bt 14 2>/dev/null | grep -oP 'root.*?:\s*\K\S+' || echo "")
fi
if [ -z "$DB_ROOT_PASS" ]; then
  DB_ROOT_PASS=$(cat /www/server/panel/config/config.json 2>/dev/null | grep -oP '"mysql_root.*?:\s*"\K[^"]+' || echo "")
fi

if [ -n "$DB_ROOT_PASS" ]; then
  mysql -uroot -p"$DB_ROOT_PASS" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null && \
  mysql -uroot -p"$DB_ROOT_PASS" -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';" 2>/dev/null && \
  mysql -uroot -p"$DB_ROOT_PASS" -e "GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost'; FLUSH PRIVILEGES;" 2>/dev/null
  echo "  OK 数据库 $DB_NAME 已创建（用户: $DB_USER）"
else
  echo "  无法自动获取MySQL root密码，请手动在宝塔面板创建数据库"
fi

# 4. 部署后端
echo "[4/8] 部署后端代码..."
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

if [ -d backend-dist ]; then
  mkdir -p dist
  cp -r backend-dist/* dist/
  cp package.json .
  cp nest-cli.json .
  echo "  OK 后端代码已就位"
else
  echo "  后端文件未找到，请确保已上传完整"
fi

# 5. 创建 .env 配置
echo "[5/8] 生成 .env 配置..."
cat > .env << EOF
PORT=$BACKEND_PORT
NODE_ENV=production
JWT_SECRET=pms_$(head -c 16 /dev/urandom | xxd -p)_$(date +%s)
JWT_EXPIRES_IN=24h
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=$DB_USER
DB_PASSWORD=$DB_PASS
DB_DATABASE=$DB_NAME
PAYMENT_NOTIFY_BASE_URL=http://$SERVER_IP
EOF
echo "  OK .env 已生成"

# 6. 安装后端依赖
echo "[6/8] 安装后端依赖..."
npm install --production --ignore-scripts 2>&1 | tail -3
echo "  OK 依赖安装完成"

# 7. 启动后端
echo "[7/8] 用 PM2 启动后端..."
pm2 delete payment-system 2>/dev/null || true
pm2 start dist/main.js --name payment-system --node-args="--max-old-space-size=512"
pm2 save
echo "  OK 后端已启动 (端口 $BACKEND_PORT)"

# 8. 部署前端
echo "[8/8] 部署前端静态文件..."
FRONTEND_DIR="/www/wwwroot/payment-frontend"
mkdir -p "$FRONTEND_DIR"
if [ -d frontend-dist ]; then
  cp -r frontend-dist/* "$FRONTEND_DIR/"
  echo "  OK 前端文件已部署到 $FRONTEND_DIR"
fi

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo "  后端API:  http://$SERVER_IP:$BACKEND_PORT/api"
echo "  前端页面: http://$SERVER_IP"
echo ""
echo "  下一步: 在宝塔面板 > 网站中添加站点"
echo "  - 域名: $SERVER_IP"
echo "  - 根目录: $FRONTEND_DIR"
echo "  - 添加反向代理: /api -> http://127.0.0.1:$BACKEND_PORT"
echo "=========================================="
