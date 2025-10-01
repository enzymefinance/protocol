# Enzyme Blue

[![CI](../../actions/workflows/ci.yaml/badge.svg)](../../actions/workflows/ci.yaml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

Enzyme Blue is an Ethereum-based protocol for decentralized on-chain asset management. It is a protocol for people or entities to manage their wealth & the wealth of others within a customizable and safe environment. It empowers anyone to set up, manage and invest in customized on-chain investment vehicles.

## Security Issues and Bug Bounty

If you find a vulnerability that may affect live deployments, you can submit a report via:

A. Immunefi (https://immunefi.com/bounty/enzymefinance/), or

B. Direct email to [security@enzyme.finance](mailto:security@enzyme.finance)

Please **DO NOT** open a public issue.

## Using this Repository

This is the branch for active development of Enzyme Blue v4.

v4 contract deployments can be found [here](https://docs.enzyme.finance/developers/contracts).

This repository has been migrated from Hardhat to Foundry. Most tests for core v4 system contracts have not been ported from Hardhat. The legacy test suite & test coverage are in the [hardhat branch](https://github.com/enzymefinance/protocol/tree/hardhat).

### Prerequisites

Make sure to have the following installed:

- [foundry](https://github.com/foundry-rs/foundry)
- [make](https://www.gnu.org/software/make)

Then, clone this repository:

```
git clone [GIT_REPOSITORY_URL]
```

### Compile Contracts

Compile contracts, build artifacts, and generate internal interfaces for foundry deployment and tests:

```sh
make
```

#### Interface Generation

Interfaces are only generated for items listed in this [interfaces file](/tests/interfaces/interfaces.txt).

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

By contributing, you agree your contribution is licensed under GPL-3.0,
and may also be sublicensed by Enzyme Foundation under alternative terms (e.g., BUSL-1.1).

## Licensing

- Public: GPL-3.0 (see [LICENSES/GPL-3.0](LICENSES/GPL-3.0))
- Alternative Terms: The copyright holder, Enzyme Foundation, may license this code under
  alternative terms (e.g., BUSL-1.1) for affiliated/internal products.

SPDX identifiers:

- Source files in this repo use: `GPL-3.0`.
- Vendored third-party files retain their original identifiers (e.g., `MIT` for OpenZeppelin).
