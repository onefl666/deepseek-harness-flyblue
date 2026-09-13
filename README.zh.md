# DeepSeek Harness FlyBlue Edition

[English](README.md) | 中文

本仓库是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的分支发行版，由 FlyBlue 定制维护，仓库见 [github.com/onefl666/deepseek-harness-flyblue](https://github.com/onefl666/deepseek-harness-flyblue)。上游项目由 [DeepSeek AI](https://deepseek.com) 开发。

本分支独立维护，选择性合并上游变更：不保障与上游 dsh 官方仓库始终同步更新，也不保障合并每一个 dsh 官方提交。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## 开发者预览

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

## 运行

<a id="run-from-source"></a>

### 从源码运行

本分支只以源码形式分发。安装 `Node.js`（`^22.19.0 || >=24.0.0`），然后运行：

```sh
git clone https://github.com/onefl666/deepseek-harness-flyblue.git
cd deepseek-harness-flyblue
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物，`pnpm dsh web` 则直接使用这些已构建产物，不会重新构建。该命令默认在 `http://127.0.0.1:3080` 提供 Web UI，本机启动时会用默认浏览器打开；通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有，传入 `--no-open` 可只运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

输入框的模型芯片是 Claude 风格推理滑块（[DSH Claude Style Reasoning Slider](https://github.com/MEMZ-JZY/DSH-Claude-Style-Reasoning-Slider)）；在 web profile patch 中停用 `effort-slider` 行即可恢复原生触发器。

标准模式、PTC 模式和创造模式默认提供发行版附带的 [`@colbymchenry/codegraph`](https://www.npmjs.com/package/@colbymchenry/codegraph) 引擎上的 `codegraph_explore`。每个 workspace 仍需本地 `.codegraph/` 索引。Web UI 可从空白会话提示条、**设置 → 代码索引**或 `/codegraph-init` 创建索引；CLI 与 headless 用户自行运行 `codegraph init`。没有索引时工具仍会列出，并让 agent 改用普通文件工具。

## 社区与支持

- 欢迎通过 [Issues](https://github.com/onefl666/deepseek-harness-flyblue/issues) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 引用

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
