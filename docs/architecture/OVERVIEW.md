# 系统架构总览（Australian AI 3D Home Design & Renovation Platform）

## 1. 总体技术方案

本平台面向澳大利亚个人住宅业主（Detached House / Single & Double-Storey / Townhouse），遵循 `SceneData JSON` 单一权威数据源架构，严格解耦 **业务数据层**、**程序化几何层**、**PBR 材质与南半球日照层**、**2D/3D 交互控制层** 与 **Vue 3 应用表现层**：

- **前端应用 (`apps/web`)**：Vue 3 (Composition API) + TypeScript (`strict: true`) + Vite + Pinia + Vue Router + Tailwind CSS。
- **移动端封装 (`apps/mobile`)**：Capacitor 跨平台容器（共享核心 Three.js 场景系统与业务状态，独立虚拟摇杆触摸交互与自适应移动端 Quality Profile）。
- **实时三维引擎 (`packages/*`)**：基于 Three.js `WebGLRenderer` (WebGL2) 构建抽象渲染适配层（预留 WebGPU 扩展接口）：
  - `scene-schema`：统一 Y-Up 右手米制坐标（`unit: "m"`, Ground `Y = 0`）TypeScript + Zod 校验模型及版本迁移器。
  - `house-generator`：真实厚度墙体转角修剪、门窗洞口分割（窗台、过梁、门窗框、玻璃、门扇）、多边形房间楼板/吊顶/踢脚线、澳式坡屋顶与檐口。
  - `materials`：13+ 大类物理比例 PBR 材质系统（Albedo、Normal、Roughness、Metalness、AO 程序化合成贴图缓存 + 世界米制 UV 映射）。
  - `lighting`：南半球真实太阳位置算法（Sydney/Melbourne/Brisbane/Perth 经纬度、日期、朝向角、早/中/下午/傍晚四时段）+ PMREM 环境反射贴图 + ACES Filmic 色调映射与室内外自动曝光过渡。
  - `landscape`：澳式独栋地块（前院、车道、步道、后院草坪、木质露台 Patio、Pergola 凉棚、泳池、围栏、`InstancedMesh` 桉树与本土灌木）。
  - `furniture`：真实米制尺寸家具资产库（支持本地商业安全 GLB 加载与高精度参数化 PBR 组件）+ 防穿墙/门洞净空碰撞校验 + 确定性自动布局算法。
  - `walkthrough`：第一人称自由漫游（WASD + 鼠标视角 + 墙体滑动碰撞检测 + 室内外连续通行 + 手机端双区虚拟摇杆）、Orbit 环绕与 Top-Down 俯视模式。
  - `floorplan-editor`：交互式 2D 户型编辑器（底图叠加、平移缩放、墙体端点拖拽与吸附、新增/删除墙体与门窗、房间命名、比例尺两点标定、Undo/Redo），与 3D 实时同步。
- **后端与 AI 服务 (`services/api` + 模块化子服务)**：Python 3.13 + FastAPI + Pydantic v2 + SQLAlchemy 2.x（本地 SQLite 零配置启动，生产环境无缝切换 PostgreSQL）：
  - 模块化 AI Provider：配置 `GEMINI_API_KEY` 时调用真实多模态模型；未配置时显式标记为 `assisted_demo` 辅助识别/规则设计模式（含置信度与人工标定引导，绝不伪造隐式 AI 成功）。

## 2. 目录结构

```text
kujiale/
├── apps/
│   ├── web/                  # Vue 3 C端消费级 Web 工作台
│   └── mobile/               # Capacitor iOS/Android 封装配置
├── packages/
│   ├── shared/               # en-AU 度量衡/货币/日期工具、2D 多边形几何算法、Undo/Redo 栈
│   ├── scene-schema/         # 统一 Scene JSON Schema、DesignCommand 校验、悉尼海岸示范住宅数据
│   ├── asset-manager/        # GPU 资源追踪释放、纹理/材质缓存、可取消 GLB 加载器
│   ├── materials/            # PBR 材质工厂与物理比例纹理合成器
│   ├── lighting/             # 澳洲南半球太阳轨迹计算、PMREM 环境光、室内外曝光控制
│   ├── house-generator/      # 程序化建筑三维几何生成引擎
│   ├── landscape/            # 澳式庭院、露台、泳池与 InstancedMesh 植被系统
│   ├── furniture/            # 家具资产库、空间碰撞约束校验与自动布局器
│   ├── walkthrough/          # 第一人称漫游、Orbit、俯视相机及移动端触摸控制器
│   ├── three-engine/         # WebGL2 渲染器封装、QualityProfile、拾取拖拽与性能监控
│   └── floorplan-editor/     # 2D 交互式户型编辑器（与 SceneData 实时双向同步）
├── services/
│   ├── api/                  # FastAPI 模块化单体服务（Projects / Floorplans / Scenes / Designs / Renders）
│   ├── floorplan-ai/         # 户型图解析 Provider（Gemini Vision + 轮廓辅助识别模式）
│   ├── design-ai/            # 自然语言装修指令解析与澳式风格方案生成
│   └── render-worker/        # 异步渲染任务管理与 Cycles 导出接口
├── assets/                   # 本地可验证户型图样本与自生成商业安全 GLB 资产
├── docs/                     # 架构、API、开发指南与架构决策记录 (ADR)
└── tests/                    # 单元、前后端契约集成与核心流程测试
```

## 3. MVP 实施顺序

1. **Milestone 1 (Phase 0 + Phase 1)**：Monorepo 与前后端脚手架、统一 `SceneSchema`、约 215 m² 悉尼海岸独栋住宅三维生成、PBR 材质与南半球日照阴影、室内外第一人称连续漫游、家具选择/材质替换与后端持久化保存。
2. **Milestone 2 (Phase 2)**：交互式 2D 户型编辑器（墙体拖拽/增删、门窗编辑、比例尺标定、撤销重做）及 2D/3D 实时几何同步。
3. **Milestone 3 (Phase 3)**：户型图上传校验（PNG/JPG/PDF）、模块化 AI 识别接口（含置信度与人工校正闭环）及端到端生成 3D 住宅。
4. **Milestone 4 (Phase 4 & 5 基础)**：4 套澳洲本土室内风格预设、规则驱动家具自动布局、自然语言装修指令（Schema 校验）、多方案保存对比、Quality Profile 画质分级与移动端虚拟摇杆适配。
