<img src = "https://github.com/melonproject/branding/blob/master/melon/Social%20Media%20Profile%20Picture%201.jpg" width = "25%">

# protocol

Melon ([méllō], μέλλω; Greek for "destined to be") is blockchain software that seeks to enable participants to set up, manage and invest in technology regulated investment funds in a way that reduces barriers to entry while minimizing the requirements for trust.

It does so by leveraging off the fact that digital assets on distributed quasi turing complete machines can be held solely by smart-contract code and spent only if its preprogrammed within this code. The Melon protocol is a set of rules for how digital assets can be spent once held in a Melon smart-contract, or a Melon investment fund. It's meant to protect the investor and fund manager from malevolent behaviour of each other.

Melon is for wealth management what Bitcoin is for accounting, a set of rules, enforced by blockchain technology, legitimized by the consent of its participants.

This repository contains a reference implementation of the Melon protocol written in Solidity, as specified in our [paper][paper-url].

[![Gitter](https://badges.gitter.im/melonproject/general.svg)](https://gitter.im/melonproject/general?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![Build Status](https://travis-ci.org/melonproject/protocol.svg?branch=master)](https://travis-ci.org/melonproject/protocol)
[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-brightgreen.svg)](http://www.gnu.org/licenses/gpl-3.0)
[![Coverage Status](https://coveralls.io/repos/github/melonproject/protocol/badge.svg?branch=master)](https://coveralls.io/github/melonproject/protocol?branch=master)

## Table of Contents

* [Implementation](#implementation-overview)
* [Modules](#modules)
    * [Module interactions](#boolean-functions)
    * [Input formats](#input-formats)
* [Get started](#get-started)
    * [Installation](#installation)
    * [Testing](#testing)
    * [Linting](#linting)
    * [Deployment](#deployment)
* [Contributing](#contributing)
    * [Security Issues](#security-issues)
    * [Protocol Design](#protocol-design)
    * [Implementation Design](#implementation-design)

## Get started

### Installation

1. Clone this repository
    ```
    git clone --recursive git@github.com:melonproject/protocol.git
    cd protocol
    ```

2. Install dependencies
    ```
    npm install
    ```

3. Generate bytecode and abi of smart-contracts using [dapp](https://github.com/dapphub/dapp) suite

    ```
    npm run compile
    ```

### Testing

After installation is complete, go to the above `protocol` directory, open a terminal and:

1. Launch a testrpc client:
    ```
    npm run localnode
    ```

2. Open a second terminal and run the test framework:
    ```
    npm test
    ```

### Linting

After installation is complete, go to the above `protocol` directory, open a terminal and run:

`npm run lint`


### Deployment

After installation is complete, go to the above `protocol` directory, open a terminal and:

1. Launch a ethereum client. For example something similar to this:
    ```
    parity --chain kovan --author <some address> --unlock <some address> --password <some password file>
    ```

2. Open a second terminal and deploy contracts using truffle
    ```
    truffle migrate --network kovan
    ```

## Contributing

As an open-source project we ❤️ any kind of community involvement. Whether that is by contributing code, reporting issues or engaging in insightful discussions.

### Security Issues

If you find a vulnerability that may affect live or kovan deployments please send your report privately to admin@melonport.com. Please DO NOT file a public issue.

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

[paper-url]: https://github.com/melonproject/whitepaper/blob/master/melonprotocol.pdf
[gitter-badge]: https://img.shields.io/gitter/room/melonproject/general.js.svg?style=flat-square
[gitter-url]: https://gitter.im/melonproject/general?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-badge]: https://img.shields.io/badge/License-GPL%20v3-blue.svg?style=flat-square
[license-badge-url]: ./LICENSE
[dependencies-badge]: https://img.shields.io/david/melonproject/melon.js.svg?style=flat-square
[dependencies-badge-url]: https://david-dm.org/melonproject/melon.js
[devDependencies-badge]: https://img.shields.io/david/dev/melonproject/melon.js.svg?style=flat-square
[devDependencies-badge-url]: https://david-dm.org/melonproject/portal#info=devDependencies
[NSP Status badge]: https://nodesecurity.io/orgs/melonproject/projects/cb1dd04e-1069-4ffd-8210-70ec757ed3de/badge?style=flat-square
[NSP Status]: https://nodesecurity.io/orgs/melonproject/projects/cb1dd04e-1069-4ffd-8210-70ec757ed3de
