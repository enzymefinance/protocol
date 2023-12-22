# Enzyme Protocol

[![CI](../../actions/workflows/ci.yaml/badge.svg)](../../actions/workflows/ci.yaml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

Enzyme is an Ethereum-based protocol for decentralized on-chain asset management. It is a protocol for people or entities to manage their wealth & the wealth of others within a customizable and safe environment. Enzyme empowers anyone to set up, manage and invest in customized on-chain investment vehicles.

## Security Issues and Bug Bounty

If you find a vulnerability that may affect live deployments, you can submit a report via:

A. Immunefi (https://immunefi.com/bounty/enzymefinance/), or

B. Direct email to [security@enzyme.finance](mailto:security@enzyme.finance)

Please **DO NOT** open a public issue.

## Using this Repository

This is the branch for active development, and it contains:

1. Not fully audited: work-in-progress system contracts changes
2. Audited and in-use: "plugin" contracts (e.g., integrations, price feeds, policies, fees) and peripheral contracts (e.g., wrappers) that are backwards-compatible with v4.

For deployed, in-production system contracts, see the relevant release branch (e.g., `v4`).

v4 contract deployments can be found [here](https://docs.enzyme.finance/developers/contracts).

### Prerequisites

#### Automatic

This repository comes with a reproducible development environment based on `nix` and `direnv`.

For the best possible developer experience, make sure you have the following installed:

- [nix](https://nix.dev)
- [direnv](https://direnv.net)

Once you have these installed, your isolated local development environment will be set up automatically whenever you navigate to this directory.

#### Manual

If you don't want to use `nix`, make sure to have the following installed:

- [foundry](https://github.com/foundry-rs/foundry)
- [make](https://www.gnu.org/software/make)
- [bun](https://bun.sh)

Then, clone this repository:

```
git clone [GIT_REPOSITORY_URL]
```

### Compile Contracts

Generate internal interfaces for foundry deployment and tests:

```sh
make build
```

### Run Tests

First, create your `.env` file by copying `.env.example`. Input your Ethereum (and/or other networks) node endpoint info as-needed (generally, only setting `ETHEREUM_NODE_MAINNET`, `ETHEREUM_NODE_POLYGON`, etc is fine).

Then, in order to run the test suite:

```sh
make test
```

You can also manually run parts of the test suite using `forge` directly, e.g:

```sh
forge test --match-test <REGEX>
```

#### Hardhat test coverage

This repository has been migrated from Hardhat to Foundry, and old test suites are still being ported.

If you are looking for the legacy test suite & test coverage please refer to the [hardhat branch](https://github.com/enzymefinance/protocol/tree/hardhat).

## Contributing

See [our contributing instructions](.github/CONTRIBUTING.md).

Please note that all repositories hosted under this organization follow our [Code of Conduct](.github/CODE_OF_CONDUCT.md), make sure to review and follow it.
