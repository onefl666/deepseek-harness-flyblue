# DeepSeek Harness FlyBlue Edition

English | [中文](README.zh.md)

This repository is a fork distribution of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), customized and maintained by FlyBlue at [github.com/onefl666/deepseek-harness-flyblue](https://github.com/onefl666/deepseek-harness-flyblue). The upstream project is developed by [DeepSeek AI](https://deepseek.com).

This fork is maintained independently and merges upstream changes selectively: there is no guarantee of staying current with the upstream dsh repository or of merging every upstream commit.

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from source

This fork is distributed as source only. Install `Node.js` (`^22.19.0 || >=24.0.0`), then run:

```sh
git clone https://github.com/onefl666/deepseek-harness-flyblue.git
cd deepseek-harness-flyblue
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts, and `pnpm dsh web` uses those built artifacts without rebuilding. The command serves the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch; an SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address, and `--no-open` runs the server without opening a browser. See the [Web UI guide](docs/user/guide/index.md).

The composer model chip is a Claude-style reasoning slider ([DSH Claude Style Reasoning Slider](https://github.com/MEMZ-JZY/DSH-Claude-Style-Reasoning-Slider)); disable the `effort-slider` row in the web profile patch to restore the native trigger.

Standard, PTC, and Create modes include `codegraph_explore` from the bundled [`@colbymchenry/codegraph`](https://www.npmjs.com/package/@colbymchenry/codegraph) engine. Each workspace still needs a local `.codegraph/` index. The Web UI can create it from the blank-session prompt, **Settings → Code index**, or `/codegraph-init`; CLI and headless users run `codegraph init`. Without an index the tool stays listed and tells the agent to use ordinary file tools.

## Community and support

- Feel free to submit feedback or bug reports through [Issues](https://github.com/onefl666/deepseek-harness-flyblue/issues).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## Citation

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
