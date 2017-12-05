<img src = "https://github.com/melonproject/branding/blob/master/melon/03_M_logo.jpg" width = "25%">

# protocol

Melon ([méllō], μέλλω; Greek for "destined to be") is blockchain software that seeks to enable participants to set up, manage and invest in technology regulated investment funds in a way that reduces barriers to entry while minimizing the requirements for trust.

It does so by leveraging off the fact that digital assets on distributed quasi turing complete machines can be held solely by smart-contract code and spent only if its preprogrammed within this code. The Melon protocol is a set of rules for how digital assets can be spent once held in a Melon smart-contract, or a Melon investment fund. It's meant to protect the investor and fund manager from malevolent behaviour of each other even when both parites remain private.

Melon is for investment funds what Bitcoin is for accounting, a set of rules, enforced by blockchain technology, legitimized by the consent of its participants.

This repository contains a reference implementation of the Melon protocol written in Solidity, as specified in our [paper][paper-url].

[![Gitter][gitter-badge]][gitter-url]
[![Build Status](https://travis-ci.org/melonproject/protocol.svg?branch=master)](https://travis-ci.org/melonproject/protocol)
[![License: GPL v3][license-badge]][license-badge-url]
[![Coverage Status](https://coveralls.io/repos/github/melonproject/protocol/badge.svg?branch=master)](https://coveralls.io/github/melonproject/protocol?branch=master)

## Table of Contents

* [Implementation](#implementation-overview)
    * [Governance](#governance)
    * [Funds](#funds)
    * [Modules](#modules)
* [Interaction](#interaction)
* [Get started](#get-started)
    * [Installation](#installation)
    * [Testing](#testing)
    * [Linting](#linting)
    * [Deployment](#deployment)
* [Contribute](#contribute)
    * [Security Issues](#security-issues)
    * [Protocol Design](#protocol-design)
    * [Implementation Design](#implementation-design)


## Implementation

### Governance

<img src = "https://github.com/melonproject/branding/blob/master/explanation/governance.png" width = "100%">

The main functionality of the [Governance](src/system/Governance.sol) contract is to add new protocol _versions_ such as this [Version](src/version/Version.sol) contract and to shut down existing versions once they become obsolete.

Adding new protocol version is done by anyone _proposing_ a version to be added and is _executed_ once authority consensus has been established.

Shutting down an existing protocol version is done by anyone _proposing_ a version to be shut down and is _executed_ once authority consensus has been established.

Shutting down a version disables the ability to setup new funds using this version and enables anyone to shut down any existing funds of this version.

### Funds

The Participation module takes as input the following parameters:

**Requests:** Describes and logs whenever asset enter and leave fund due to Participants

Name | Data Type | Description
--- | --- | ---
participant | `address` | Participant in Melon fund requesting subscription or redemption
status | `enum` | Enum: active, cancelled, executed; Status of request
requestType | `enum` | Enum: subscribe, redeem
shareQuantity | `uint256` | Quantity of Melon fund shares
giveQuantity | `uint256` | Quantity in Melon asset to give to Melon fund to receive shareQuantity
receiveQuantity | `uint256` | Quantity in Melon asset to receive from Melon fund for given shareQuantity
incentiveQuantity | `uint256` | Quantity in Melon asset to give to person executing request
lastPriceFeedUpdateId | `uint256` | Data feed module specific id of last update
lastPriceFeedUpdateTime | `uint256` | Data feed module specific timestamp of last update
timestamp | `uint256` | Time of request creation

While the Risk Management module takes as input the following parameters:

**Orders:** Describes and logs whenever assets enter and leave fund due to Manager

Name | Data Type | Description
--- | --- | ---
exchangeId | `uint256` | Id as returned from exchange
status | `enum` | Enum: active, partiallyFilled, fullyFilled, cancelled
orderType | `enum` | Enum: make, take
sellAsset | `address` | Asset (as registered in Asset registrar) to be sold
buyAsset | `address` | Asset (as registered in Asset registrar) to be bought
sellQuantity | `uint256` | Quantity of sellAsset to be sold
buyQuantity | `uint256` |  Quantity of sellAsset to be bought
timestamp | `uint256` | Time in seconds when this order was created
fillQuantity | `uint256` | Buy quantity filled; Always less than buy_quantity

### Modules

<img src = "https://github.com/melonproject/branding/blob/master/explanation/fund.png" width = "100%">

### List of Melon modules

Melon has six different module classes:
- Exchange Adapters
- Rewards
- Participation
- Risk Management
- Asset registrars
- Data feeds

Which can be categorized into three sub sets:
- Libraries
- Boolean function
- Infrastructure

#### Libraries

They interact with the Melon protocol using as pre-linked libraries to the Melon version contract. These Melon modules are:

- **Exchange Adapters**:
These are adapters between Melon protocol and decentralized exchanges. Responsible for relaying information, making and taking orders on exchanges.

- **Rewards**:
This module defines functions for calculating management and performance rewards for the fund manager. Management reward is calculated on the time managed irrespective of performance of the fund while performance reward is calculated based on the performance.

#### Boolean functions

They interact with the Melon protocol using boolean functions. That is functions which take a certain set of inputs and return either true or false. These Melon modules are:

- **Participation**:
It comprises of two primary boolean functions isSubscriptionPermitted and isRedemptionPermitted which enforce rules for investing and redemption from the fund. They take the parameter inputs as specified in the earlier section.

- **Risk Management**:
It currently comprises of two boolean functions isMakePermitted and isTakePermitted. They take the parameter inputs as specified in the earlier section. This module can be extended with custom logic to prevent malevolent actions by the fund manager. This may include checks if the order price is significantly different from the reference price, e.t.c.

#### Infrastructure

These are security critical infrastructure modules. These Melon modules are:

- **Asset registrars**:
It is a chain independent asset registrar module. Only the registered assets will be available. Cross-chain asset integration is enabled through Polkadot in future. An asset can be registered via the register function by specifying the following parameters:

Name | Data Type | Description
--- | --- | ---
asset | `address` | Address of the asset
name | `string` | Human-readable name of the Asset as in ERC223 token standard
symbol | `string` | Human-readable symbol of the Asset as in ERC223 token standard
decimal | `uint` |  Decimal, order of magnitude of precision, of the Asset as in ERC223 token standard
url | `string` | URL for extended information of the asset
ipfsHash | `bytes32` | Same as url but for ipfs
chainid | `bytes32` |  Chain where the asset resides
breakIn | `address` | Break in contract on destination chain
breakOut | `address` | Break out contract on this chain

- **Data feeds**:
Data feeds route external information such as asset prices to Melon fund smart contracts.

The reason they are security critical is that the correctness of the data they provide cannot directly be enforced or guaranteed and trust is placed on a central authority.

## Interaction

Smart contract interaction for the following scenarios:
- Setup of a new Melon fund
- Participant invests in a Melon fund
- Participant redeems from a Melon fund
- Manager makes an order
- Manager takes an order
- Manager converts rewards into shares
- Manager shuts down the fund

**Setup of a new Melon fund**

A new Melon fund can be setup by specifying the following parameters via setupFund function of the version contract:

Name | Data Type | Description
--- | --- | ---
name | `string` |A human readable name of the fund
referenceAsset | `address` | Asset against which performance reward is measured against
managementRewardRate | `uint` | Reward rate in referenceAsset per delta improvement
performanceRewardRate | `uint` | Reward rate in referenceAsset per managed seconds
participation | `address` | Participation module
riskMgmt | `address` | Risk management module
sphere | `address` | Sphere module

**Participant invests in a Melon fund**

1. A participant starts to invest in a fund F by first creating a subscription request R. Parameters to be specified are:

Name | Data Type | Description
--- | --- | ---
giveQuantity | `uint` | Quantity of Melon tokens to invest
shareQuantity | `uint` | Quantity of fund shares to receive
incentiveQuantity | `uint` | Quantity of Melon tokens to award the entity executing the request

2. R parameters are checked against restriction rules specified in the participation module P by the boolean function P.isSubscriptionPermitted (E.g Participant being an attested Uport identity).
3. R is then executed in by any entity via F.executeRequest after certain conditions are satisfied.  These conditions include if *currentTimestamp - R.timestamp >= DF.INTERVAL* (DF refers to datafeed module and INTERVAL corresponds to update frequency value) and if *DF.getLastUpdateId >= R.lastPriceFeedUpdateId + 2*. This is to minimize unfair advantage from information asymmetries associated with the investor.

**Participant redeems from a Melon fund**

1. A participant can redeem from a fund by first creating a redemption request. Parameters to be specified are:

Name | Data Type | Description
--- | --- | ---
shareQuantity | `uint` | Quantity of fund shares to redeem
receiveQuantity | `uint` | Quantity of Melon tokens to receive in return
incentiveQuantity | `uint` | Quantity of Melon tokens to award the entity executing the request

2. Request parameters are checked against restriction rules specified in the participation module P via the boolean function P.isRedemptionPermitted.
3. R is then executed in a similar way as mentioned earlier.

**Manager makes an order**

1. Manager can make an order by specifying asset pair, sell and buy quantities as parameters. Asset pair is checked against datafeed module DF through the function DF.existsPriceOnAssetPair. Order parameters are then checked against restriction rules specified in the risk management module R via the boolean function R.isMakePermitted.
2. The specified quantity of the asset is given allowance to the selected exchanging via ERC20's approve function.
3. Order is then placed on the selected exchange through the exchangeAdapter contract E via E.makeOrder by specifying the exchange and order parameters as parameters.
4. The order is filled on the selected exchange (In future, can be any compatible decentralized exchange like OasisDex, Kyber, e.t.c)  when the price is met.

**Manager takes an orders**

1. Manager can take an order by specifying an order id and quantity as parameters. Asset pair is checked against datafeed module DF through the function DF.existsPriceOnAssetPair. Order parameters are then checked against restriction rules specified in the risk management module R via the boolean function R.isTakePermitted.
2. The specified quantity of the asset is given allowance to the selected exchanging via ERC20's approve function.
3. Order id must correspond to a valid, existing order on the selected exchange. Order is then placed on the selected exchange through the exchangeAdapter contract E via E.takeOrder by specifying the exchange and order parameters as parameters.

**Manager converts rewards into shares**

1. Manager rewards in the form of ownerless shares of the fund F can be allocated to the manager via F.convertUnclaimedRewards function. Ownerless shares refer to the quantity of shares, representing unclaimed rewards by the Manager such as rewards for managing the fund and for performance. First internal stats of F are calculated using F.performCalculations function. The quantity of unclaimedRewards is calculated internally using calcUnclaimedRewards function.
2. A share quantity of *unclaimedRewards * gav* (from Calculations) is assigned to the manager.

**Manager shuts down the fund**

1. A Manager can shut down a fund F he owns via F.shutdown function.
2. Investing, redemption (Only in reference asset, investors can still redeem in the form of percentage of held assets), managing, making / taking orders, convertUnclaimedRewards are rendered disabled.


## Get started


### Installation

You will need the `dapp` developer tools, which you can install using [these steps](http://dapp.tools/).

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

1. Launch a parity dev chain with the provided genesis settings file
    ```
    parity --chain test/chainGenesis.json --jsonrpc-apis all
    ```

2. Import the predefined accounts into parity and fund them by executing:
    ```
    npm run beforeTests
    ```

3. Close the already running parity instance and run:
    ```
    parity --chain test/chainGenesis.json --unlock 0x00248D782B4c27b5C6F42FEB3f36918C24b211A5,0x00660f1C570b9387B9fA57Bbdf6804d82a9FDC53,0x00b71117fff2739e83CaDBA788873AdCe169563B,0x0015248B433A62FB2d17E19163449616510926B6,0x00f18CD3EA9a97828861AC9C965D09B94fcE746E,0x0089C3fB6a503c7a1eAB2D35CfBFA746252aaD15 --password=password --force-ui --no-persistent-txqueue --jsonrpc-apis all --reseal-min-period 0
    ```

4. Open a second terminal and deploy the contracts to the development network:

    ```
    npm run compile && npm run deploy:development
    ```

5. Compile all the contracts:

    ```
    npm run compile
    ```

6. Run the test framework:
    ```
    npm test
    ```

### Linting

After installation is complete, go to the above `protocol` directory, open a terminal and run:

`npm run lint`


### Deployment

After installation is complete, go to the above `protocol` directory, open a terminal and:

1. Launch an ethereum client. For example something similar to this:
    ```
    parity --chain kovan --author <some address> --unlock <some address> --password <some password file>
    ```

2. Open a second terminal and deploy the contracts:
    ```
    npm run deploy:kovan
    ```

## Contribute

As an open-source project we welcome any kind of community involvement. Whether that is by contributing code, reporting issues or engaging in insightful discussions.

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

[paper-url]: https://github.com/melonproject/paper/blob/master/melonprotocol.pdf
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
