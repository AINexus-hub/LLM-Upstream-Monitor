# LLM-Upstream-Monitor 第一版开发基准文档

## 1. 项目定位

LLM-Upstream-Monitor 是一个用于检查上游 AI LLM Gateway 余额的本地监控项目。

第一版只聚焦两个核心能力：

- 渠道管理：支持添加渠道、编辑渠道配置，并支持 NewAPI、Sub2API 两个查询模板。
- 可视化图表：记录余额检测结果，并展示余额变化趋势。

本文档只固定第一版开发内容。未写入本文档的能力，不属于第一版范围。

## 2. 第一版功能范围

### 2.1 渠道管理

第一版需要支持渠道的基础管理：

- 添加渠道。
- 编辑渠道配置。
- 查看渠道列表。
- 查看渠道最近一次余额检测结果。
- 手动触发渠道余额检测。
- 根据渠道配置的查询间隔自动检测余额。

第一版支持两种渠道模板：

- NewAPI
- Sub2API

渠道类型在创建时选择。不同渠道类型展示不同的配置字段。

### 2.2 NewAPI 渠道配置

NewAPI 渠道需要配置以下信息：

- 渠道名称。
- 请求地址。
- 访问令牌。
- 用户 ID。
- 超时时间。
- 查询间隔。

NewAPI 查询规则：

- 请求地址：`{{requestUrl}}/api/user/self`
- 请求方法：`GET`
- 请求头：
  - `Content-Type: application/json`
  - `Authorization: Bearer {{accessToken}}`
  - `User-Agent: cc-switch/1.0`
  - `New-Api-User: {{userId}}`

NewAPI 余额解析规则：

```ts
if (response.success && response.data) {
  return {
    planName: response.data.group || "默认套餐",
    remaining: response.data.quota / 500000,
    used: response.data.used_quota / 500000,
    total: (response.data.quota + response.data.used_quota) / 500000,
    unit: "USD",
  }
}

return {
  isValid: false,
  invalidMessage: response.message || "查询失败",
}
```

### 2.3 Sub2API 渠道配置

Sub2API 渠道需要配置以下信息：

- 渠道名称。
- API Key。
- 请求地址。
- 超时时间。
- 查询间隔。

Sub2API 查询规则：

- 请求地址：`{{requestUrl}}/v1/usage`
- 请求方法：`GET`
- 请求头：
  - `Authorization: Bearer {{apiKey}}`

Sub2API 余额解析规则：

```ts
const remaining = response?.remaining ?? response?.quota?.remaining ?? response?.balance
const unit = response?.unit ?? response?.quota?.unit ?? "USD"

return {
  isValid: response?.is_active ?? response?.isValid ?? true,
  remaining,
  unit,
}
```

### 2.4 余额检测

第一版需要支持：

- 手动检测单个渠道余额。
- 根据每个渠道的查询间隔自动检测余额。
- 每次检测保存一条检测记录。
- 检测失败时保存失败状态和错误信息。
- 将 NewAPI、Sub2API 的响应统一转换为内部余额结果结构。

统一余额结果结构：

```ts
type BalanceResult = {
  isValid: boolean
  planName?: string
  remaining?: number
  used?: number
  total?: number
  unit?: string
  invalidMessage?: string
}
```

### 2.5 余额变化图表

第一版需要提供余额变化可视化：

- 展示单个渠道的余额变化趋势。
- 图表数据来自历史检测记录。
- 图表使用 Recharts 实现。
- 图表至少展示检测时间和剩余额度。

## 3. 第一版页面范围

### 3.1 渠道列表页

渠道列表页需要展示：

- 渠道名称。
- 渠道类型：NewAPI / Sub2API。
- 请求地址。
- 当前余额。
- 单位。
- 最近检测时间。
- 最近检测状态。

渠道列表页需要支持：

- 添加渠道。
- 编辑渠道。
- 手动检测余额。
- 进入渠道详情。

### 3.2 渠道表单

渠道表单根据渠道类型展示不同字段。

NewAPI 表单字段：

- 渠道名称。
- 请求地址。
- 访问令牌。
- 用户 ID。
- 超时时间。
- 查询间隔。

Sub2API 表单字段：

- 渠道名称。
- API Key。
- 请求地址。
- 超时时间。
- 查询间隔。

### 3.3 渠道详情页

渠道详情页需要展示：

- 渠道基础配置。
- 最近一次余额检测结果。
- 余额变化图表。
- 最近检测记录。
- 最近错误信息。

## 4. 技术栈

### 4.1 前端

第一版固定采用：

- React
- Vite
- TypeScript
- TailwindCSS
- shadcn/ui
- Recharts

前端要求：

- 第一屏直接进入监控工具界面。
- 不做营销页、介绍页或装饰性首页。
- UI 风格以工具型、清晰、紧凑、可扫描为主。

### 4.2 后端

第一版后端采用 Node.js 实现。

推荐技术栈：

- Node.js
- TypeScript
- Fastify
- SQLite
- Drizzle ORM
- node-cron
- 原生 `fetch` 或 `undici`
- Zod
- dotenv

选择 Node.js 的原因：

- 前后端都使用 TypeScript，类型更容易统一。
- 项目核心是 HTTP 查询、响应解析、定时检测和数据存储，Node.js 足够胜任。
- 查询模板可以用 TypeScript 内置实现，避免运行任意用户脚本。

### 4.3 数据库

第一版使用 SQLite。

需要持久化：

- 渠道配置。
- 余额检测历史。
- 最近检测状态和错误信息。

## 5. 数据结构基准

### 5.1 渠道类型

```ts
type ChannelType = "newapi" | "sub2api"
```

### 5.2 渠道配置

```ts
type ChannelConfig = {
  id: string
  name: string
  type: ChannelType
  requestUrl: string
  timeoutSeconds: number
  checkIntervalMinutes: number
  createdAt: string
  updatedAt: string
}
```

### 5.3 NewAPI 渠道配置

```ts
type NewApiChannelConfig = ChannelConfig & {
  type: "newapi"
  accessToken: string
  userId: string
}
```

### 5.4 Sub2API 渠道配置

```ts
type Sub2ApiChannelConfig = ChannelConfig & {
  type: "sub2api"
  apiKey: string
}
```

### 5.5 检测历史

```ts
type BalanceCheckRecord = {
  id: string
  channelId: string
  checkedAt: string
  success: boolean
  isValid: boolean
  planName?: string
  remaining?: number
  used?: number
  total?: number
  unit?: string
  errorMessage?: string
}
```

## 6. 后端 API 基准

### 6.1 渠道管理

- `GET /api/channels`
- `POST /api/channels`
- `GET /api/channels/:id`
- `PATCH /api/channels/:id`

### 6.2 余额检测

- `POST /api/channels/:id/check`
- `GET /api/channels/:id/checks`

## 7. 安全要求

- 访问令牌和 API Key 不应在前端列表中明文展示。
- 后端返回渠道列表和详情时，敏感字段需要脱敏。
- 编辑渠道时允许重新填写敏感字段。
- 第一版不执行用户输入的任意 JavaScript 查询脚本。
- NewAPI 和 Sub2API 查询逻辑由后端内置 TypeScript 代码实现。

## 8. 开发过程要求

- 第一版严格以本文档为功能边界。
- 未写入本文档的功能不进入第一版开发。
- 开发时优先实现完整闭环：添加渠道、检测余额、保存历史、展示图表。
- 前后端字段命名需要保持一致。
- 修改数据结构时同步更新本文档。
- 涉及访问令牌、API Key 的地方必须避免前端明文泄露。
- UI 以监控工具为目标，避免做成营销页。
- 提交前至少运行类型检查或基础构建。
