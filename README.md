# Melon Protocol

[![Build Status](https://img.shields.io/travis/melonproject/protocol/master.svg?style=flat-square)](https://travis-ci.org/melonproject/protocol)

Melon is blockchain software that seeks to enable participants to set up, manage and invest in technology regulated investment funds in a way that reduces barriers to entry, while minimizing the requirements for trust.

The Melon protocol is a set of rules for how digital assets can be spent once held in a Melon smart-contract, or a Melon investment fund.
These rules are meant to protect the investor and fund manager from malevolent behaviour of each other, even when both parties remain private.

## Install

### Prerequisites

- [node](https://www.nodejs.org)
- [yarn](https://www.yarnpkg.com)

```sh
git clone https://github.com/melonproject/protocol.git
cd protocol
yarn install
```

## Compile contracts

```sh
yarn build
```

## Test

```sh
yarn test
```

## Contribute

See [our contributing instructions](CONTRIBUTING.md).

### Security Issues

If you find a vulnerability that may affect live or testnet deployments, please send your report privately to [security@meloncouncil.io](mailto:security@meloncouncil.io). Please **DO NOT** file a public issue.
