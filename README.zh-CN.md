<p align="center">
  <img src="./logo.png" alt="Learn Anything 标志" width="120" />
</p>

# Learn Anything V2

[English](./README.md) · [Español](./README.es.md) · [中文](./README.zh-CN.md)

这是 [ChenChenyaqi/learn-anything](https://github.com/ChenChenyaqi/learn-anything) 的独立 V2 fork。它保留原始 MIT 许可证和署名，同时让学习数据持久、带修订、以本地优先。CLI 包目前为 private：请从本仓库的 `v2` 分支安装和运行。

## 快速开始

```bash
git clone --branch v2 https://github.com/eduardojvieira/learn-anything.git
cd learn-anything
pnpm install
pnpm build

# 为学习项目生成集成，然后启动仪表盘。
node packages/cli/bin/learn-anything.js init ../my-project --tools claude --lang zh-CN
node packages/cli/bin/learn-anything.js serve ../my-project --no-open
```

服务器会显示 `http://localhost:24278`（或下一个空闲端口）。LAN 访问是有意保留的：仅在可信本地网络中使用 `http://<你的-LAN-IP>:24278`。它没有认证层。

## 使用七个工作流学习

`/learn:study` 是主工作流：它向确定性 runtime 请求下一步。其余工作流是专用入口。

| 工作流                      | 用途                              |
| --------------------------- | --------------------------------- |
| `/learn:study [topic]`      | 计划并记录下一个确定性学习步骤。  |
| `/learn:topic <topic>`      | 创建或检查 V2 主题。              |
| `/learn:explain <concept>`  | 运行持久化的苏格拉底式讲解。      |
| `/learn:practice <concept>` | 记录观察到的练习和纠正。          |
| `/learn:review [topic]`     | 完成到期的 retrieval 复习。       |
| `/learn:status [topic]`     | 读取派生掌握账本和下一步。        |
| `/learn:quiz <concept>`     | 运行并评估持久化 retrieval 测验。 |

文档统一展示 slash 形式；但 Codex 和 Hermes 是仅 skills 的集成：当宿主不提供 slash command 时，调用相应 skill 或用自然语言提出请求。

## V2 保证什么

`learnctl` 是唯一的规范写入者。Agent 和仪表盘读取快照并提交带修订的请求；它们绝不直接编辑规范学习文件。

- `StateStore` 使用锁、compare-and-swap 修订、原子写入、journal 和恢复。
- 主题拥有稳定 ID。显示编号（`1`、`1.1`、`1.1.1`）是派生的，不污染名称、slug 或 ID。
- 状态记录先修条件、关系、证据、校准和复习状态。掌握度从证据派生；AI 不能任意标记为已掌握。
- 学习引擎覆盖诊断、retrieval、自我解释、反馈、纠正、间隔、交错、迁移和延迟评估。调度器位于可替换的 FSRS-compatible 接口之后；V2 不声称实现了 FSRS。

### 规范数据与派生视图

```text
.learn/
├── config.json                         # locale、时区、编号
└── topics/<slug>/
    ├── state.json                       # 规范 V2 主题状态
    ├── state.v1.json.bak                # 仅由 V1 → V2 迁移创建
    ├── knowledge-map.md                 # 派生视图
    └── sessions/<uuid>/
        ├── session.json                 # 规范会话
        └── views/{en,es,zh-CN}.md       # 派生的本地化视图
```

不要把旧 Markdown、练习或测验当作规范状态。

## 仪表盘和集成

`serve` 打开 Mastery Ledger：一个 paper/serif 风格的派生掌握度、规范会话和可编辑苏格拉底回答视图。仪表盘写入使用修订（`If-Match`）和 idempotency key；过期更新会成为明确冲突，而不是静默覆盖。

所有生成的集成都调用 `learnctl`。Codex 与 Hermes 在 `.agents/skills/` 下安装标准 skills；OpenCode 在 `.opencode/commands/` 下获得真实 commands；其他工具保留原有 skills/adapters。英语、西班牙语和简体中文（`en`、`es`、`zh-CN`）通过 `.learn/config.json` 在 CLI、skills 和仪表盘间共享。

`init` 和 `update` 会在生成集成前串联 V0 → V1 → V2 迁移。V1 状态会备份，重跑是幂等的；无效状态或不安全路径会中止生成。`learnctl migrate` 仅保留给高级 runtime 使用。`--force` 只替换生成的集成文件；它不会绕过状态验证或 symlink/escape 保护。

## 开发

```bash
pnpm lint
pnpm test
pnpm build
cd packages/cli
npm pack --dry-run
cd ../..
```

请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解 fork 流程，参阅 [UPSTREAM.md](./UPSTREAM.md) 了解如何向原项目提取独立改进。

## 许可证与署名

[MIT](./LICENSE) © [yaqi chen](https://github.com/ChenChenyaqi)。V2 作为 [eduardojvieira/learn-anything](https://github.com/eduardojvieira/learn-anything) fork 维护；原项目仍是 [ChenChenyaqi/learn-anything](https://github.com/ChenChenyaqi/learn-anything)。
