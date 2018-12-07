# Melon Protocol

<img src = "https://github.com/melonproject/branding/blob/master/melon/03_M_logo.jpg" width = "25%" align="right">

[![Gitter chat](https://img.shields.io/gitter/room/melonproject/protocol.js.svg?style=flat-square&colorB=46bc99)](https://gitter.im/melonproject/general 'Gitter chat')
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

### Prerequisites

- Yarn

### Installation

```sh
# Clone this repository
git clone git@github.com:melonproject/protocol.git
cd protocol
# Install dependencies
yarn install
```

If you don't set `JSON_RPC_ENDPOINT`, the test will load ganache in-memory which works but is much slower.

### Deployment and testing

After installation, go to the above `protocol` directory, open a terminal and:

```sh
# Generate bytecode and abi of smart-contracts
yarn compile
# Launch parity dev chain:
yarn devchain
# Open a second terminal and deploy the contracts to the development network:
yarn deploy (Not working yet)
# Run the tests using
yarn test (Not working yet)
```

### Alternatives

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

## Use it as a consumer

To integrate the Melon Protocol into your application, you do not need to clone this repo, you can just install it from npm:

```bash
yarn add @melonproject/protocol
```

You need to have a local dev-chain running to develop your consuming application. We recommend Ganache:

```bash
yarn add -D ganache-cli
yarn ganache-cli --gasLimit 0x7a1200 --defaultBalanceEther 1000000
```

Then, you can deploy the contracts to your local dev node:

```bash
yarn melon deploy
```

This creates a new deployment which you can use like this:

```typescript
import * as protocol from '@melonproject/protocol';

const environment = await protocol.utils.environment.initTestEnvironment();
const deployment = protocol.utils.solidity.getDeployment(environment);
const hub = await protocol.factory.managersToHubs(
  deployment.fundFactory,
  '0xdeadbeef',
  environment,
);
```

## Development Tips

### Using the logger

To help debug the system, the test environment has a test logger that logs into `./logs/`. This keeps the terminal clean but also a great possibility to inspect the logs in detail. Here is how it works:

Inside a function that has the environment, the `environment.logger` is a curried function with the following signature:

```ts
(namespace: string, level: LogLevels, ...messages: any): void;

```

This currying gives a high level of flexibility, but basically we just use this pattern:

```ts
const debug = environment.logger('melon:protocol:utils', LogLevels.DEBUG);

// and then use debug as you would console.log:

debug('Something happened', interestingObject, ' ... and more ...', whatever);
```

### Deconstruct a transaction from the transactionFactory

Generally, transactions have a shortcut method called `execute`, which is renamed to the actual transaction name:

```ts
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';

const params = {
  howMuch: createQuantity(shared.token, 2000000),
  to: shared.accounts[1],
};

await transfer(params);
```

If one needs to have custom access to the different steps, like a custom signer, the transaction function can be decomposed into a prepare and sign step:

```ts
import { sign } from '~/utils/environment/sign';

const prepared = await transfer.prepare(params);

const signedTransactionData = await sign(prepared.rawTransaction, environment);

const result = await transfer.send(signedTransactionData, params);
```

### Skip gas estimation preflight/guards

Sometimes during development, one wants to check if a transaction actually fails without the guards. To do so, there are options inside of the transaction factory. The simplest example would be `transfer`. So here is the minimalistic usage of `transfer` with skipped guards and transactions:

```ts
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';

const params = {
  howMuch: createQuantity(shared.token, 2000000),
  to: shared.accounts[1],
};

await transfer(params, environment, {
  gas: '8000000',
  skipGasEstimation: true,
  skipGuards: true,
});
```

The same pattern could be applied to the deconstructed execute:

```ts
import { sign } from '~/utils/environment/sign';

const options = {
  gas: '8000000',
  skipGasEstimation: true,
  skipGuards: true,
};

const prepared = await transfer.prepare(params, options);

const signedTransactionData = await sign(prepared.rawTransaction, environment);

const result = await transfer.send(signedTransactionData, params);
```

### Events

**Main principle**: Every smart contract should be seen as an [event-sourced](https://martinfowler.com/eaaDev/EventSourcing.html) entity:

- It has one current state. We can query the current state through calls.
- This current state is the result of an initial state and a list of transactions that altered that state. When the state of a smart contract changes, it should emit events in a fashion that **an external observer can reproduce the state of the smart contract from every point in history only by observing the emitted events**.

In other words: Events should transport as much information as needed so that an observer can sync for example a database.

#### How to do this:

1. Define the shape of the state of a smart contract
2. Define possible changes to that state
3. Emit events when that state changes.

#### Example ERC20

1. Shape of state:

```solidity
mapping (address => uint256) balances;
```

2. Possible changes:

- Someone sends somebody an amount: Transfer
- Someone approves somebody an amount to spend: Approval

3. Emit events:
   It is obvious for that example, but lets see what an observer can see the following events and reproduce every step in history.

For the sake of simplicity, lets assume that:
`0x0`: is the null address
`0x1`: user 1
`0x2`: user 2
...and so on

```
Transfer(0x0, 0x1, 100) // Initial minting: User 1 receives 100 tokens. Total 100 tokens.
Transfer(0x1, 0x2, 30) // User 1 sends 30 tokens to user 2. New balances: User 1: 70, User 2: 30.
...
```

## Troubleshooting

### Permission denied (publickey) when cloning the repo

Try cloning using `git clone https://github.com/melonproject/smart-contracts.git`

### Spec json is invalid when running Parity Devchain

Update your Parity installation to the latest version or try changing `"instantSeal": null` to `"instantSeal": { "params": {} }` in chainGenesis.json

### Stuck at deploy step

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
