# Melon Protocol

<img src = "https://github.com/melonproject/branding/blob/master/melon/03_M_logo.jpg" width = "25%" align="right">

[![Gitter chat](https://img.shields.io/gitter/room/melonproject/protocol.js.svg?style=flat-square&colorB=46bc99)](https://gitter.im/melonproject/general "Gitter chat")
[![Build Status](https://img.shields.io/travis/melonproject/protocol/master.svg?style=flat-square)](https://travis-ci.org/melonproject/protocol)
[![Solidity version](https://img.shields.io/badge/solidity-0.4.19-brightgreen.svg?style=flat-square&colorB=C99D66)](https://github.com/ethereum/solidity/releases/tag/v0.4.19)
[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg?style=flat-square)](https://www.gnu.org/licenses/gpl-3.0)
![Dependencies](https://img.shields.io/david/melonproject/melon.js.svg?style=flat-square)
![Development Dependencies](https://img.shields.io/david/dev/melonproject/melon.js.svg?style=flat-square)

Melon ([méllō], μέλλω; Greek for "destined to be") is blockchain software that seeks to enable participants to set up, manage and invest in technology regulated investment funds in a way that reduces barriers to entry, while minimizing the requirements for trust.

It does so by leveraging the fact that digital assets on distributed quasi-Turing Complete machines can be held solely by smart-contract code, and spent only according to preprogrammed rules within this code.
The Melon protocol is a set of rules for how digital assets can be spent once held in a Melon smart-contract, or a Melon investment fund.
These rules are meant to protect the investor and fund manager from malevolent behaviour of each other, even when both parties remain private.

Melon is to investment funds as Bitcoin is to accounting: a set of rules, enforced by blockchain technology, legitimized by the consent of its participants.

This repository contains a reference implementation of the Melon protocol written in Solidity, as specified in our [paper][paper-url].

## Get started

### Installation

You will need the `dapp` developer tools, which you can install using [these steps](http://dapp.tools/).

```sh
# Clone this repository
git clone --recursive git@github.com:melonproject/protocol.git
cd protocol
# Install dependencies
npm install
# Generate bytecode and abi of smart-contracts using dapp suite
npm run compile
```

### Deployment and testing

After installation, go to the above `protocol` directory, open a terminal and:

```sh
# Launch parity dev chain:
npm run devchain
# Open a second terminal and deploy the contracts to the development network:
npm run deploy
# Run the tests using
npm test
```

### Kovan Deployment

After installation is complete, go to the above `protocol` directory, open a terminal and:

```sh
# Launch an ethereum client. For example something similar to this:
parity \
  --chain kovan      \
  --rpcport 8545     \
  --auto-update=all  \
  --jsonrpc-apis=all \
  --author <address> \
  --unlock <address> \
  --password <password file>

# Open a second terminal and deploy the contracts:
npm run deploy:kovan
```
## Troubleshooting

#### Spec json is invalid when running Parity Devchain
Update your Parity installation to the latest version or try changing `"instantSeal": null` to `"instantSeal": { "params": {} }` in chainGenesis.json

#### Stuck at deploy step
Deploying contracts may stuck indefinitely in case your parity node is not unlocked for some reason. Locked node requires you to enter password for each transaciton manually.

## Contributing

As an open-source project, we welcome any kind of community involvement, whether that is by contributing code, reporting issues or engaging in insightful discussions.
Please see [our contributing instructions](CONTRIBUTING.md) for information on the code style we use.

### Security Issues

If you find a vulnerability that may affect live or testnet deployments please send your report privately to [security@melonport.com](http://keyserver2.pgp.com/vkd/SubmitSearch.event?SearchCriteria=security%40melonport.com). Please **DO NOT** file a public issue.

### Protocol Design

When considering protocol design proposals, we are looking for:

- A description of the problem this design proposal solves
- Discussion of the tradeoffs involved
- Review of other existing solutions
- Links to relevant literature (RFCs, papers, etc)
- Discussion of the proposed solution

Please note that protocol design is hard, and meticulous work. You may need to review existing literature and think through generalized use cases.

### Implementation Design

When considering design proposals for implementations, we are looking for:

- A description of the problem this design proposal solves
- Discussion of the tradeoffs involved
- Discussion of the proposed solution

[paper-url]: https://github.com/melonproject/paper/blob/specs/specs.pdf
[dependencies-badge-url]: https://david-dm.org/melonproject/melon.js
