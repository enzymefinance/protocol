# Melon Protocol

[![Build Status](https://img.shields.io/travis/melonproject/protocol/master.svg?style=flat-square)](https://travis-ci.org/melonproject/protocol)

Melon is blockchain software that seeks to enable participants to set up, manage and invest in technology regulated investment funds in a way that reduces barriers to entry, while minimizing the requirements for trust.

It does so by leveraging the fact that digital assets on distributed quasi-Turing Complete machines can be held solely by smart-contract code, and spent only according to preprogrammed rules within this code.
The Melon protocol is a set of rules for how digital assets can be spent once held in a Melon smart-contract, or a Melon investment fund.
These rules are meant to protect the investor and fund manager from malevolent behaviour of each other, even when both parties remain private.

Melon is to investment funds as Bitcoin is to accounting: a set of rules, enforced by blockchain technology, legitimized by the consent of its participants.

[Melon paper](https://github.com/melonproject/paper/blob/specs/specs.pdf)

## Install

### Prerequisites

- [node](https://www.nodejs.org)
- [yarn](https://www.yarnpkg.com)

```sh
git clone https://github.com/melonproject/protocol.git
cd protocol
yarn install
```

### Uniswap source files

(This is a temporary step until we dockerize)

Download the Uniswap contract `.abi` and `.bin` source files

```sh
curl -s -H "Accept:application/vnd.github.v3.raw" https://api.github.com/repos/Uniswap/contracts-vyper/contents/abi/uniswap_exchange.json\?ref\=c10c08d81d6114f694baa8bd32f555a40f6264da > out/UniswapExchange.abi

curl -s -H "Accept:application/vnd.github.v3.raw" https://api.github.com/repos/Uniswap/contracts-vyper/contents/abi/uniswap_factory.json\?ref\=c10c08d81d6114f694baa8bd32f555a40f6264da > out/UniswapFactory.abi

curl -s -H "Accept:application/vnd.github.v3.raw" https://api.github.com/repos/Uniswap/contracts-vyper/contents/bytecode/exchange.txt\?ref\=c10c08d81d6114f694baa8bd32f555a40f6264da > out/UniswapExchange.bin

curl -s -H "Accept:application/vnd.github.v3.raw" https://api.github.com/repos/Uniswap/contracts-vyper/contents/bytecode/factory.txt\?ref\=c10c08d81d6114f694baa8bd32f555a40f6264da > out/UniswapFactory.bin
```

## Test

After installation, go to the above `protocol` directory, open a terminal and:

```sh
yarn devchain

# in a second terminal
make all
yarn test
```

## Deploy

```sh
yarn deploy
```

## Consume

TODO: check out other repo

## Contribute

See [our contributing instructions](CONTRIBUTING.md).

### Security Issues

If you find a vulnerability that may affect live or testnet deployments, please send your report privately to [security@melonport.com](http://keyserver2.pgp.com/vkd/SubmitSearch.event?SearchCriteria=security%40melonport.com). Please **DO NOT** file a public issue.
