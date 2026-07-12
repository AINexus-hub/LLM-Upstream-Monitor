# LLM-Upstream-Monitor

本项目用于检查上游 AI LLM Gateway 余额。第一版聚焦渠道管理和余额变化图表，支持 NewAPI 与 Sub2API 两个模板。

开发基准见 [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)。

## 本地开发

```bash
npm install
npm run dev
```

默认端口：

- Web: `http://localhost:5300`
- API: `http://localhost:3000`

## 桌面端

桌面端基于 Electron，启动时会在本机运行 API 服务并加载已构建的 Web 界面，无需单独启动 Web 或 API 进程。

开发桌面端：

```bash
npm run desktop:dev
```

在 Windows 上构建便携版可执行文件：

```bash
npm run desktop:build
```

构建产物位于 `release/LLM-Upstream-Monitor-<version>-portable.exe`。便携版的数据默认保存在可执行文件同级目录下的 `data/llm-upstream-monitor.db`；可通过 `LLM_UPSTREAM_MONITOR_DATA_DIR` 环境变量指定其他数据目录。

## 校验

```bash
npm run typecheck
npm test
```
