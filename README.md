<img src = "https://github.com/melonproject/branding/blob/master/facebook/Facebook%20cover%20blue%20on%20white.png" width = "100%">

# protocol
Melon Protocol Specification

See our [wiki][wiki-url] or read our [whitepaper][whitepaper-url] for more information.

[![Slack Status](http://chat.melonport.com/badge.svg)](http://chat.melonport.com) [![Gitter](https://badges.gitter.im/melonproject/general.svg)](https://gitter.im/melonproject/general?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge) [![Build Status](https://travis-ci.org/melonproject/protocol.svg?branch=master)](https://travis-ci.org/melonproject/protocol) [![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-brightgreen.svg)](http://www.gnu.org/licenses/gpl-3.0)

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
    node_modules/.bin/testrpc
    ```

2. Open a second terminal and run the test framework:
    ```
    node_modules/.bin/truffle test
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
    truffle migrate
    ```
