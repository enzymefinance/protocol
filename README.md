# Enzyme Protocol

![Build Status](../../workflows/CI/badge.svg)

Enzyme is an Ethereum-based protocol for decentralized on-chain asset management. It is a protocol for people or entities to manage their wealth & the wealth of others within a customizable and safe environment. Enzyme empowers anyone to set up, manage and invest in customized on-chain investment vehicles.

## Install

### Prerequisites

- [node](https://www.nodejs.org)
- [yarn](https://www.yarnpkg.com)

```sh
git clone [GIT_REPOSITORY_URL]
cd protocol
yarn install
```

## Compile contracts

```sh
yarn compile
```

## Test

First, create a `.env` file by copying `.env.example`. Input your Ethereum node endpoint info as-needed (generally, only setting `ETHEREUM_NODE_MAINNET` is fine).

Then, you can run tests. The full test suite can be run with:

```sh
yarn test
```

Note that tests might fail on the first runs while building a cache for the fork block, due to timeout. Continue to run tests as-needed, which will build the cache.

## Contribute

See [our contributing instructions](CONTRIBUTING.md).

Please note that all repositories hosted under this organization follow our [Code of Conduct](CODE_OF_CONDUCT.md), make sure to review and follow it.

### Security Issues

If you find a vulnerability that may affect live or testnet deployments, please send your report privately to [security@enzyme.finance](mailto:security@enzyme.finance). Please **DO NOT** file a public issue.
