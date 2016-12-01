# protocol
Melon Protocol Specification

See our [wiki][wiki-url] or read our [whitepaper][whitepaper-url] for more information.

[![Slack Status](http://chat.melonport.com/badge.svg)](http://chat.melonport.com) [![Gitter](https://badges.gitter.im/melonproject/general.svg)](https://gitter.im/melonproject/general?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

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

## Deployment

After installation is complete, go to the above `protocol` directory, open a terminal and:

1. Launch a ethreum client. For example something similar to this:
    ```
    parity --chain ropsten --author <some address> --unlock <some address> --password <some password file> -lrpc=trace
    ```

2. Open a second terminal and run deploy the contracts as specified in the `deployment.js` file:
    ```
    node index.js
    ```
