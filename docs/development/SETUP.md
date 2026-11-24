# 本地开发、测试与移动端打包指南

## 1. 本地零配置开发模式
- 数据库默认使用本地 SQLite (`services/api/data/aussiehome.db`)，无需手工启动外部数据库即可完整体验保存、重载与多方案对比。
- 生产或联调 PostgreSQL 时，只需在 `.env` 中设置：
  `DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/aussiehome`
- AI 服务采用透明双模式：
  - 配置 `GEMINI_API_KEY` 后自动启用 Gemini Vision 户型理解与自然语言室内设计。
  - 未配置密钥时界面显式展示 `Local Assisted Mode`，使用确定性图像尺寸分析与防穿墙规则布局引擎，支持完整端到端流程测试。

## 2. 重新生成本地测试资产
如果需要重新生成商业安全的示例 GLB 模型与测试户型图纸：
```bash
node scripts/generate-assets.mjs
```

## 3. Capacitor 移动端集成 (`apps/mobile`)
PC 与移动端共享同一套 `@kujiale/three-engine` 场景代码，手机端自动启用 `medium` / `low` 画质配置与双区触摸虚拟摇杆：
```bash
pnpm --filter @kujiale/web build
cd apps/mobile
npx cap sync
```
随后可通过 Xcode (`npx cap open ios`) 或 Android Studio (`npx cap open android`) 在真机或模拟器中运行。
