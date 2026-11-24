# REST API 接口参考 (`/api/v1`)

所有接口均通过 Pydantic v2 进行强类型入参/出参校验，默认监听 `http://127.0.0.1:8000/api/v1`。

## 系统健康检查
- `GET /api/v1/health` — 返回数据库连接状态、存储后端模式及 AI Provider 状态（`gemini` 或 `assisted_demo`，绝不暴露密钥本身）。

## 项目管理 (`Projects`)
- `GET /api/v1/projects` — 获取住宅项目列表（首次空库访问会自动初始化 `Sydney Coastal Pavilion` 示例项目）。
- `POST /api/v1/projects` — 创建新住宅项目（支持指定澳洲城市、住宅类型、朝向角与初始场景）。
- `GET /api/v1/projects/{id}` — 获取项目详情。
- `PATCH /api/v1/projects/{id}` — 更新项目名称、简介或城市。
- `DELETE /api/v1/projects/{id}` — 删除住宅项目及关联数据。

## 户型图上传与 AI 识别 (`Floorplans`)
- `POST /api/v1/floorplans/upload` — 上传 `PNG` / `JPG` / `PDF` 图纸（校验二进制文件头签名与 20MB 大小上限，私有 UUID 存储防路径穿越）。
- `POST /api/v1/floorplans/{id}/recognize` — 执行结构化户型识别（支持传入 `knownWallLengthMeters` 标定比例尺；返回房间多边形、墙体、门窗、置信度与需要人工复核的提示项）。
- `GET /api/v1/floorplans/{id}` — 查询户型图识别状态与结果。
- `GET /api/v1/floorplans/{id}/file` — 安全读取私有图纸预览流。

## 三维场景持久化 (`Scenes`)
- `GET /api/v1/scenes/{id}` — 获取权威 `SceneData` JSON 及版本号 `revision`。
- `PUT /api/v1/scenes/{id}` — 校验并保存完整 `SceneData` JSON（自动递增 `revision`）。

## AI 室内设计与多方案对比 (`Designs`)
- `POST /api/v1/designs/generate` — 基于澳洲风格预设或自然语言需求生成并保存一套独立装修方案快照（含 AUD 家具预算汇总）。
- `POST /api/v1/designs/apply-command` — 解析自然语言装修需求，输出受 Schema 校验的 `DesignCommand[]` 与更新后的 `SceneData`。
- `GET /api/v1/projects/{id}/designs` — 获取项目下已保存的多套装修方案用于切换对比。

## 渲染导出 (`Rendering`)
- `POST /api/v1/renders` — 创建异步渲染任务（返回 `202 Accepted` 与 Job ID，支持实时高清快照存档与无头 Blender Cycles 脚本生成）。
- `GET /api/v1/renders/{id}` — 查询渲染任务真实状态（`queued` -> `processing` -> `completed` / `failed`）与输出产物。
