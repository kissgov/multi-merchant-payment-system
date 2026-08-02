/**
 * 安装本地 git hooks（零依赖方案，替代 husky）。
 *
 * 由 `npm install` / `npm run prepare` 触发，将 scripts/hooks/* 复制到 .git/hooks/。
 * - 仅在 .git 目录存在时执行（CI、`--no-save` 等场景安全跳过）。
 * - 复制后赋予可执行权限（0o755）。
 * - 已存在的 hook 会被覆盖，保证仓库内 hook 内容为单一事实来源。
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const gitDir = path.join(repoRoot, '.git');
const hooksDestDir = path.join(gitDir, 'hooks');
const hooksSrcDir = path.join(__dirname, 'hooks');

if (!fs.existsSync(gitDir)) {
  // 非 git 仓库（如 npm 包安装到全局/其他项目）—— 安全跳过
  process.exit(0);
}

if (!fs.existsSync(hooksDestDir)) {
  fs.mkdirSync(hooksDestDir, { recursive: true });
}

const hooks = fs.existsSync(hooksSrcDir) ? fs.readdirSync(hooksSrcDir) : [];
let installed = 0;
for (const name of hooks) {
  const src = path.join(hooksSrcDir, name);
  const dest = path.join(hooksDestDir, name);
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  installed++;
}

if (installed > 0) {
  console.log(`[hooks] 已安装 ${installed} 个 git hook 到 .git/hooks/`);
}
