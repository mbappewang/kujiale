# ADR-001: 实时渲染管线与模块化单体架构决策

## 状态
已采纳 (2026-11-25)

## 背景
平台需要在桌面端浏览器（Chrome / Edge / Safari）及移动端 WebView（Capacitor iOS WKWebView / Android WebView）上提供高真实感的澳大利亚独栋住宅室内外连续漫游与实时材质/户型编辑。

## 决策
1. **WebGL2 (`THREE.WebGLRenderer`) 优先 + 渲染适配层抽象**：现阶段移动 WebView 对 WebGPU 的支持仍存在碎片化风险，因此 MVP 采用成熟稳定的 `WebGLRenderer` + `PMREMGenerator` + `ACESFilmicToneMapping` + `PCFSoftShadowMap`，并通过 `three-engine` 封装渲染器生命周期以便未来平滑扩展 `WebGPURenderer`。
2. **`SceneData` JSON 单一事实来源 (Single Source of Truth)**：所有 2D 户型编辑、AI 户型识别、AI 装修指令与材质修改均只变更受 Schema 校验的 `SceneData` 数据，再由 `HouseSceneEngine` 按模块增量重建并释放旧 GPU 缓冲，严禁将 `THREE.Object3D` 作为唯一业务状态。
3. **世界空间米制 UV + 程序化 PBR 贴图与本地 GLB 结合**：建筑构件尺寸动态变化，全部采用 `1 unit = 1 metre` 世界坐标平面/立面 UV 投影，配合程序化无缝 PBR 四通道贴图（Albedo / Normal / Roughness / AO）与本地自生成无版权风险 GLB 资产，确保离线可运行、无纹理拉伸且零侵权风险。
4. **模块化单体后端 (FastAPI + SQLite Fallback / PostgreSQL Ready)**：将 `floorplan_ai`、`design_ai`、`render_worker` 拆分为职责独立的 Python 包并由 `services/api` 统一挂载，兼顾本地单命令零依赖启动与后续独立 Worker 水平扩展。
