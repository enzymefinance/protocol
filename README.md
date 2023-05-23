# Enzyme Protocol

![Build Status](../../workflows/CI/badge.svg)

Enzyme is an Ethereum-based protocol for decentralized on-chain asset management. It is a protocol for people or entities to manage their wealth & the wealth of others within a customizable and safe environment. Enzyme empowers anyone to set up, manage and invest in customized on-chain investment vehicles.

## Security Issues and Bug Bounty

If you find a vulnerability that may affect live deployments, you can submit a report via:

A. Immunefi(https://immunefi.com/bounty/enzymefinance/), or

B. Direct email to [security@enzyme.finance](mailto:security@enzyme.finance)

Please **DO NOT** open a public issue.

## Using this Repo

### A Tale of Two Frameworks

:construction:

This repo is currently in-flux for a gradual move from Hardhat to Foundry, so there are mixed dependencies, deployment mechanisms, helpers, and tests. The following rules should hold:

- all production contracts live in `contracts/persistent/` and `contracts/release/` (deployed contracts [here](https://docs.enzyme.finance/developers/contracts))
- the "old" Hardhat-based dependencies / deployment / helpers / tests live in `hardhat/`
- the "new" Foundry-based dependencies / deployment / helpers / tests live in `tests/`

Test suites are being gradually migrated from the Hardhat setup to Foundry, so check both for test coverage.

### Prerequisites

1. Make sure to have the following installed:

- [node](https://www.nodejs.org)
- [pnpm](https://pnpm.io)
- [foundry](https://github.com/foundry-rs/foundry)
- [make](https://www.gnu.org/software/make/)

2. Clone this repo:

```
git clone [GIT_REPOSITORY_URL]
```

### Dependencies

1. Install node packages:

```sh
pnpm install
```

2. Generate internal interfaces for foundry deployment and tests:

```sh
make build
```

### Compile contracts

```sh
pnpm compile
```

### Run tests

1. Create a `.env` file by copying `.env.example`. Input your Ethereum (and/or other networks) node endpoint info as-needed (generally, only setting `ETHEREUM_NODE_MAINNET`, `ETHEREUM_NODE_POLYGON`, etc is fine).

2. Run hardhat tests with (defaults to full test suite):

```sh
pnpm test
```

3. Run foundry tests with (defaults to full test suite):

```sh
forge test
```

Note that tests might fail on the first runs while building a cache for the fork block, due to timeout. Continue to run tests as-needed, which will build the cache.

## Contribute

See [our contributing instructions](CONTRIBUTING.md).

Please note that all repositories hosted under this organization follow our [Code of Conduct](CODE_OF_CONDUCT.md), make sure to review and follow it.
