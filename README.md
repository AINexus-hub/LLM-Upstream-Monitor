# LLM Upstream Monitor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Desktop-Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

本地优先的 **上游 AI / LLM Gateway 余额监控工具**。

支持 [NewAPI](https://github.com/QuantumNous/new-api) 与 Sub2API 风格网关：自动轮询余额、可视化趋势、余额/分组变更告警，并提供 Web 与 Windows 便携桌面端。

---

## 功能特性

| 模块 | 能力 |
| --- | --- |
| **供应商管理** | 添加 / 编辑 / 删除渠道，支持 NewAPI、Sub2API 模板 |
| **余额检测** | 手动检测 + 按渠道配置的间隔自动轮询，失败写入错误信息 |
| **监控大屏** | 余额趋势图表（Recharts）、多渠道总览与洞察 |
| **账号看板** | 上游账号快照同步（用量、分组、费率等） |
| **通知中心** | 站内通知；Telegram Bot / SMTP 邮件外发 |
| **告警策略** | 余额阈值、分组变更、分组费率变更告警开关 |
| **安全** | 访问令牌 / API Key 后端存储，前端仅展示脱敏状态 |
| **桌面端** | Electron 便携版，一键启动本地 API + Web |

### 支持的渠道模板

**NewAPI**

- `GET {{requestUrl}}/api/user/self`
- 使用 Access Token + User ID
- 余额按 `quota / 500000` 换算为 USD（与常见 NewAPI 约定一致）

**Sub2API**

- `GET {{requestUrl}}/v1/usage`
- 使用 API Key
- 可选上游登录态，用于账号看板同步

---

## 截图

> 欢迎 PR 补充界面截图。建议放置路径：`docs/images/`。

| 监控大屏 | 供应商管理 | 通知设置 |
| --- | --- | --- |
| _TODO: monitor.png_ | _TODO: channels.png_ | _TODO: notifications.png_ |

---

## 快速开始

### 环境要求

- **Node.js** 18+（推荐 20+）
- **npm** 9+
- Windows 构建桌面端时需要可用的构建环境（electron-builder）

### 安装并启动（Web + API）

```bash
git clone https://github.com/Kazi6de1b/LLM-Upstream-Monitor.git
cd LLM-Upstream-Monitor
cp .env.example .env   # Windows: copy .env.example .env
# 编辑 .env，务必将 AUTH_TOKEN 改成你自己的强随机字符串
npm install
npm run dev
```

默认地址：

| 服务 | URL |
| --- | --- |
| Web UI | http://localhost:5300 |
| API | http://localhost:3000 |
| 健康检查 | http://localhost:3000/health |

登录密码即为 `.env` 中的 `AUTH_TOKEN`（也是后续 API 请求的 Bearer Token）。

### 桌面端（开发）

```bash
npm run desktop:dev
```

会先构建 shared/api，再启动 Web 开发服与 Electron 窗口。

### 桌面端（Windows 便携版）

```bash
npm run desktop:build
```

产物：

```text
release/LLM-Upstream-Monitor-<version>-portable.exe
```

便携版数据默认写在可执行文件同级目录：

```text
data/llm-upstream-monitor.db
```

可通过环境变量覆盖数据目录：

```bash
# PowerShell 示例
$env:LLM_UPSTREAM_MONITOR_DATA_DIR = "D:\llm-monitor-data"
```

---

## 配置

复制 [`.env.example`](./.env.example) 为 `.env`：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `API_HOST` | `0.0.0.0` | API 监听地址 |
| `API_PORT` | `3000` | API 端口 |
| `DATABASE_URL` | `file:./data/llm-upstream-monitor.db` | SQLite（libSQL）路径 |
| `AUTH_TOKEN` | 内置默认值（**务必修改**） | 登录密码 / API Bearer Token |

前端可选环境变量：

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE_URL` | 覆盖默认 API 地址（默认 `http://localhost:3000`） |

也可在页面 URL 上使用查询参数：`?apiBaseUrl=http://127.0.0.1:3000`。

---

## 项目结构

```text
LLM-Upstream-Monitor/
├── apps/
│   ├── api/          # Fastify API、定时任务、SQLite、通知发送
│   ├── web/          # React + Vite 监控界面
│   └── desktop/      # Electron 主进程与打包配置
├── packages/
│   └── shared/       # 前后端共享 TypeScript 类型
├── docs/             # 开发基准与文档
├── .env.example
└── package.json      # npm workspaces 根配置
```

### 架构示意

```text
┌─────────────────┐     HTTP/JSON      ┌──────────────────────┐
│  Web (React)    │ ◄────────────────► │  API (Fastify)       │
│  Electron UI    │                    │  + node-cron         │
└─────────────────┘                    │  + libSQL (SQLite)   │
                                       └──────────┬───────────┘
                                                  │
                         ┌────────────────────────┼────────────────────────┐
                         ▼                        ▼                        ▼
                  NewAPI / Sub2API          Telegram / SMTP          本地 SQLite
                   余额 / 上游同步              告警通知               历史与配置
```

---

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 并行启动 API + Web 开发服务 |
| `npm run desktop:dev` | Electron 开发模式 |
| `npm run desktop:build` | 构建 Windows 便携 exe |
| `npm run build` | 构建全部 workspace |
| `npm run typecheck` | 全量 TypeScript 检查 |
| `npm test` | 运行 Vitest 单元 / 路由测试 |
| `npm run lint` | ESLint |
| `npm run format` | Prettier 格式化 |

---

## 技术栈

| 层级 | 选型 |
| --- | --- |
| 前端 | React 19、Vite、TypeScript、Tailwind CSS 4、Recharts |
| 后端 | Node.js、Fastify、Zod、node-cron、Nodemailer |
| 数据 | SQLite via `@libsql/client` |
| 桌面 | Electron、electron-builder（portable） |
| 工程 | npm workspaces、Vitest、ESLint、Prettier |

---

## 安全说明

- **Token / API Key 不会在列表接口中明文返回**，前端只看到 `hasAccessToken` / `hasApiKey` 等布尔字段。
- 查询逻辑由后端内置模板实现，**不会执行用户任意脚本**。
- 本工具设计为 **本地或受信网络部署**。若暴露到公网，请务必：
  1. 修改默认 `AUTH_TOKEN`
  2. 使用 HTTPS 反向代理
  3. 限制访问来源（防火墙 / VPN）
- 数据库文件含密钥与历史数据，请妥善备份并控制文件权限。

---

## API 概览

主要端点（除 `/health` 与登录外均需 `Authorization: Bearer <AUTH_TOKEN>`）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/auth/login` | 登录，body: `{ "password": "..." }` |
| `GET/POST` | `/api/channels` | 列出 / 创建渠道 |
| `GET/PATCH/DELETE` | `/api/channels/:id` | 查询 / 更新 / 删除渠道 |
| `POST` | `/api/channels/:id/check` | 手动余额检测 |
| `GET` | `/api/channels/:id/checks` | 检测历史 |
| `POST` | `/api/channels/:id/sync-upstream` | 同步上游账号快照 |
| `GET` | `/api/upstream-accounts/snapshots` | 上游快照列表 |
| `GET` | `/api/notifications` | 通知列表 |
| `GET/PUT` | `/api/notification-settings` | 通知配置 |
| `POST` | `/api/notification-settings/test` | 发送测试通知 |
| `GET` | `/health` | 健康检查 |

更完整的第一版基准见 [docs/DEVELOPMENT_PLAN.md](./docs/DEVELOPMENT_PLAN.md)（部分能力已超出该文档范围）。

---

## 开发与贡献

欢迎 Issue 与 Pull Request。

1. Fork 本仓库并创建分支：`git checkout -b feature/your-feature`
2. 安装依赖：`npm install`
3. 开发前建议跑通：

   ```bash
   npm run typecheck
   npm test
   ```

4. 提交信息尽量清晰（如 `feat:` / `fix:` / `docs:`）
5. 发起 PR，说明动机与验证方式

### 建议的贡献方向

- 补充 UI 截图与使用教程
- 更多上游网关模板
- Linux / macOS 桌面构建
- 国际化（i18n）
- 更细粒度的权限与多用户（若你需要团队部署）

---

## 路线图（非正式）

- [x] NewAPI / Sub2API 余额监控
- [x] 图表与检测历史
- [x] 通知（站内 + Telegram + SMTP）
- [x] 上游账号看板
- [x] 渠道删除与上游会话清理
- [x] Windows Electron 便携版
- [ ] 官方截图与英文文档
- [ ] 更多网关适配器
- [ ] 跨平台桌面发行

---

## 致谢

- [NewAPI](https://github.com/QuantumNous/new-api) 及各类兼容网关生态
- [Fastify](https://fastify.dev/)、[Vite](https://vite.dev/)、[Electron](https://www.electronjs.org/) 等开源项目

---

## License

本项目基于 [MIT License](./LICENSE) 开源。

```text
Copyright (c) 2026 Kazi6de1b
```

---

如果这个项目对你有帮助，欢迎 ⭐ Star，也欢迎把使用场景和改进建议开在 Issue 里。
