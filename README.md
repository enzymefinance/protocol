<img src = "https://github.com/melonproject/branding/blob/master/facebook/Facebook%20cover%20blue%20on%20white.png" width = "100%">

# protocol
Melon Protocol Solidity Implementation

See our [wiki][wiki-url] or read our [whitepaper][whitepaper-url] for more information.

[![Gitter](https://badges.gitter.im/melonproject/general.svg)](https://gitter.im/melonproject/general?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![Build Status](https://travis-ci.org/melonproject/protocol.svg?branch=master)](https://travis-ci.org/melonproject/protocol)
[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-brightgreen.svg)](http://www.gnu.org/licenses/gpl-3.0)
[![Coverage Status](https://coveralls.io/repos/github/melonproject/protocol/badge.svg?branch=master)](https://coveralls.io/github/melonproject/protocol?branch=master)

[wiki-url]: https://github.com/melonproject/protocol/wiki
[whitepaper-url]: https://github.com/melonproject/whitepaper/blob/master/melonprotocol.pdf


## Installation

1. Clone this repository
    ```
    git clone git@github.com:melonproject/protocol.git
    cd protocol
    ```

2. Install dependencies, such as [Truffle](https://github.com/ConsenSys/truffle) (requires NodeJS 5.0+) and [Testrpc](https://github.com/ethereumjs/testrpc):
    ```
    npm install
    ```

## Testing

After installation is complete, go to the above `protocol` directory, open a terminal and:

1. Launch a testrpc client:
    ```
    npm run localnode
    ```

2. Open a second terminal and run the test framework:
    ```
    npm test
    ```

## Linting

After installation is complete, go to the above `protocol` directory, open a terminal and run:

`npm run lint`


## Deployment

After installation is complete, go to the above `protocol` directory, open a terminal and:

1. Launch a ethereum client. For example something similar to this:
    ```
    parity --chain kovan --author <some address> --unlock <some address> --password <some password file>
    ```

2. Open a second terminal and deploy contracts using truffle
    ```
    truffle migrate --network kovan
    ```
    
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
