# AussieHome 3D — Australian AI 3D Home Design & Renovation Platform

> **Upload Your Floor Plan. Design Your Home. Walk Through It Before You Build.**

面向澳大利亚个人住宅业主（Detached House / Single & Double-Storey / Townhouse）的 AI 三维家装与数字孪生漫游平台。支持住宅图纸上传与结构提取、2D/3D 实时双向户型编辑、物理真实 PBR 材质替换、南半球真实太阳轨迹光照阴影、室内至后院露台泳池连续自由漫游，以及自然语言 AI 室内设计方案对比与保存。

---

## 核心特性

1. **澳大利亚本土住宅数字孪生示例 (`~216 m²`)**
   - 内置完整悉尼海岸独栋住宅（`Sydney Coastal Pavilion`）：涵盖开放式 Living / Dining / Kitchen、Master Suite、Bedroom 2、Study / Bed 3、Main Bathroom、Laundry、Double Garage，以及室外 Front Porch、Concrete Driveway、Sir Walter Buffalo 草坪、North-Facing Alfresco Timber Deck、Spotted Gum 遮阳凉棚（Pergola）、盐水泳池与玻璃护栏、桉树/本土灌木（`InstancedMesh` + `LOD`）。
   - 严格使用澳大利亚习惯：`en-AU` 界面、米/毫米（`m` / `mm`）、平方米（`m²`）、澳元（`AUD`）、`DD/MM/YYYY` 日期格式。
2. **高真实感 PBR 材质与南半球太阳光照系统**
   - 覆盖全部 13 大类 PBR 建筑材质（Timber Floor、Ceramic Tile、Marble、Concrete、Brick、Plaster、Paint、Glass、Metal、Fabric、Leather、Grass、Roof Tile），实时合成 Albedo / Normal / Roughness / AO 四通道纹理并按真实世界米制 UV 映射，杜绝纹理拉伸。
   - 基于澳大利亚城市经纬度（Sydney `-33.87°`、Melbourne、Brisbane、Perth 等）与房屋朝向计算南半球真实太阳方位角/高度角（正午阳光来自北方），支持 Morning / Noon / Afternoon / Evening 四时段、`PMREMGenerator` 环境反射、`ACESFilmicToneMapping` 及室内外漫游平滑自动曝光过渡。
3. **自由室内外漫游与多相机视角**
   - 支持 **Orbit 环绕模式**（含一键屋顶剖切 Cutaway 鸟瞰）、**First-Person 第一人称漫游**（PC 端 `WASD` + 鼠标环视 + 墙体滑动碰撞检测 + 门扇开关交互；移动端虚拟双摇杆触摸控制）与 **Top-Down 俯视模式**。
4. **2D 户型编辑器与 3D 程序化建筑实时同步**
   - 支持底图叠加、平移缩放、共享顶点墙体拖拽、新增/删除墙体与门窗、房间重命名、两点交互式比例尺标定及 Undo/Redo 历史栈，所有变更通过统一 `SceneData JSON` 实时重建三维墙体转角与门窗洞口。
5. **模块化 AI 户型识别与自然语言装修设计**
   - 后端统一管理 `GEMINI_API_KEY`；未配置 API Key 时诚实进入 **Local Assisted Mode**（提取真实图纸像素比例、标记置信度并提示人工标定比例尺，绝不伪造隐式 AI 成功）。
   - 自然语言装修编辑（如 *"Make my living room look like a modern Australian coastal home"*）输出受 Schema 校验的 `DesignCommand[]`，结合房间边界与门洞净空碰撞校验更新场景，支持多套装修方案保存与预算对比。

---

## Monorepo 目录结构

```text
kujiale/
├── apps/
│   ├── web/                  # Vue 3 + TypeScript (strict) + Vite + Pinia + Tailwind CSS
│   └── mobile/               # Capacitor iOS WKWebView / Android WebView 跨平台配置
├── packages/
│   ├── shared/               # en-AU 度量/货币/日期工具、2D 多边形与 OBB 碰撞算法、Undo/Redo
│   ├── scene-schema/         # 统一 Scene JSON Schema (Zod) 与悉尼海岸示范住宅数据
│   ├── asset-manager/        # GPU 资源追踪释放、纹理缓存、可取消 GLB 加载器
│   ├── materials/            # 13+ 类物理比例 PBR 材质与四通道贴图合成器
│   ├── lighting/             # 澳洲南半球太阳位置算法、PMREM 环境光与室内外自动曝光
│   ├── house-generator/      # 墙体转角修剪、门窗洞口分割、多边形楼板/吊顶与坡屋顶生成
│   ├── landscape/            # 澳式前院、车道、露台、凉棚、泳池、围栏与 InstancedMesh 植被
│   ├── furniture/            # 参数化 + 本地 GLB 家具资产、防穿墙/防堵门校验与自动布局器
│   ├── walkthrough/          # 第一人称漫游、Orbit、俯视相机及移动端触摸控制
│   ├── three-engine/         # WebGL2 渲染器封装、QualityProfile (Low..Ultra)、拾取拖拽与 FPS 监控
│   └── floorplan-editor/     # 交互式 2D 户型编辑器（与 3D 实时共享 SceneData）
├── services/
│   ├── api/                  # FastAPI + Pydantic v2 + SQLAlchemy 2.x (SQLite 默认 / PostgreSQL 就绪)
│   ├── floorplan-ai/         # 模块化户型图解析 Provider (Gemini Vision + Local Assisted Mode)
│   ├── design-ai/            # 自然语言装修指令解析与澳式风格方案生成
│   └── render-worker/        # 异步渲染任务队列与 Blender Cycles 脚本导出接口
├── assets/                   # 本地自生成无版权风险 GLB 模型与测试户型图样本
├── docs/                     # 架构总览、REST API 文档、开发指南与 ADR
└── tests/                    # 单元、几何、碰撞与契约测试
```

---

## 快速启动（本地开发）

### 环境要求
- **Node.js** >= 20 & **pnpm** >= 9
- **Python** 3.13（推荐使用 `uv` 自动管理虚拟环境）

### 1. 安装依赖

```bash
# 安装前端与全部 Monorepo 子包依赖
pnpm install

# 初始化环境变量（可选：在 .env 中填入 GEMINI_API_KEY 开启云端多模态识别）
cp .env.example .env
```

### 2. 启动后端 API 服务（端口 `8000`）

```bash
pnpm dev:api
# 或直接执行：
# uv run --directory services/api uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

健康检查：`http://127.0.0.1:8000/api/v1/health`  
交互式 OpenAPI 文档：`http://127.0.0.1:8000/docs`

### 3. 启动前端 3D 设计工作台（端口 `5173`）

```bash
pnpm dev
```

浏览器访问：`http://127.0.0.1:5173`

---

## 构建、类型检查与自动化测试

```bash
# 全仓 TypeScript Strict 类型检查 (11 个核心包 + Web + Mobile)
pnpm typecheck

# 运行前端与三维几何/光照/漫游碰撞单元测试 (Vitest)
pnpm test

# 运行后端 API、安全校验、户型识别与渲染任务测试 (Pytest)
pnpm test:api

# 一键执行前后端全部自动测试
pnpm test:all

# 构建生产环境前端静态包
pnpm build
```
