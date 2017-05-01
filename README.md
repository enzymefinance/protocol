<img src = "https://github.com/melonproject/branding/blob/master/facebook/Facebook%20cover%20blue%20on%20white.png" width = "100%">

# protocol
Melon Protocol Specification

See our [wiki][wiki-url] or read our [whitepaper][whitepaper-url] for more information.

[![Slack Status](http://chat.melonport.com/badge.svg)](http://chat.melonport.com) [![Gitter](https://badges.gitter.im/melonproject/general.svg)](https://gitter.im/melonproject/general?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge) [![Build Status](https://travis-ci.org/melonproject/protocol.svg?branch=master)](https://travis-ci.org/melonproject/protocol) [![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-brightgreen.svg)](http://www.gnu.org/licenses/gpl-3.0)

[wiki-url]: https://github.com/melonproject/protocol/wiki
[whitepaper-url]: https://github.com/melonproject/whitepaper/blob/master/melonprotocol.pdf


## Kovan Deployed Contracts

### Assets
- EtherToken [0x7506c7BfED179254265d443856eF9bda19221cD7](https://kovan.etherscan.io/address/0x7506c7bfed179254265d443856ef9bda19221cd7)
- MelonToken [0x4dffea52b0b4b48c71385ae25de41ce6ad0dd5a7](https://kovan.etherscan.io/address/0x4dffea52b0b4b48c71385ae25de41ce6ad0dd5a7)
- BitcoinToken [0x9E4C56a633DD64a2662bdfA69dE4FDE33Ce01bdd](https://kovan.etherscan.io/address/0x9e4c56a633dd64a2662bdfa69de4fde33ce01bdd)
- EuroToken [0xC151b622fDeD233111155Ec273BFAf2882f13703](https://kovan.etherscan.io/address/0xc151b622fded233111155ec273bfaf2882f13703)
- RepToken [0xF61b8003637E5D5dbB9ca8d799AB54E5082CbdBc](https://kovan.etherscan.io/address/0xf61b8003637e5d5dbb9ca8d799ab54e5082cbdbc)

### Price Feeds
- [Oraclize](https://github.com/oraclize/melonport)
- [CryptoCompare](https://github.com/vcealicu/melonport-price-feed)

### Exchanges
- Melon version of original [OasisDex](https://github.com/OasisDEX/oasis-pro) implementation [0x1b468875d2b8f2d2c56981db446fbb911b1b16e3](https://kovan.etherscan.io/address/0x1b468875d2b8f2d2c56981db446fbb911b1b16e3) 


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
