# 视觉质量与性能基准报告 (Visual & Performance Benchmark)

测试环境：macOS (Apple Silicon) · Google Chrome (ANGLE / Metal WebGL2) · Viewport `1600×920` · `Quality: HIGH`

## 1. 实测性能指标

| 指标 | 实测数值 | 说明 |
| --- | --- | --- |
| 实时帧率 (FPS) | **60 FPS** | 满帧稳定运行（目标 60 FPS） |
| 帧耗时 (Frame Time) | **16.7 ms** | 含 `PCFSoftShadowMap` 2048 阴影与 `ACESFilmicToneMapping` |
| GPU Draw Calls | **502** | 草丛与灌木使用 `InstancedMesh` 单批次合批渲染 |
| 生产包体积 (Gzip) | **272.3 kB** (总计) | `vue` 41.5 kB + `app` 93.2 kB + `three` 137.6 kB |
| 控制台运行时错误 | **0** | Playwright 全流程监控 `pageerror` 与 `console.error` 为空 |

## 2. 固定视角基准截图清单

- `01-dashboard.png`：澳大利亚住宅项目仪表盘（`en-AU`、`DD/MM/YYYY`、AI 模式透明状态徽章）
- `02-3d-exterior-orbit.png`：西北向室外鸟瞰（Colorbond 瓦楞坡屋顶、悉尼砂岩砖外墙、Spotted Gum 凉棚条形日照阴影、黑胡桃木露台、泳池与玻璃护栏）
- `03-3d-dollhouse-cutaway.png`：屋顶剖切（Dollhouse Cutaway）室内全景（客厅、瀑布石中岛厨房、主卧、独立浴缸卫生间、无闪烁转角墙体）
- `04-walkthrough-living-room.png`：第一人称室内漫游视角（从客厅透过 3.4m 开启式玻璃推拉门望向户外木质露台餐桌）
- `05-walkthrough-backyard-pool.png`：第一人称后院泳池视角（户外草坪光影、玻璃护栏与室内空间连续过渡）
- `06-split-2d-3d-editor.png`：2D/3D 分屏双向实时编辑与自然语言 AI 室内设计指令执行结果
- `07-floorplan-recognition-review.png`：样本户型图上传与透明 `assisted_demo` 结构提取审核页
- `08-recognized-3d-house.png`：从上传图纸端到端自动生成的三维住宅与防穿墙规则家具布局
