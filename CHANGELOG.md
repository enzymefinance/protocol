# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## Unreleased

### Changed

- use ds-math instead of safeMath.sol

## [0.5.2]

### Added

- register reference asset when datafeed is initially deployed
- maximum number of registered assets
- test shutting down Version via Governance
- test assets can register without error

### Changed

- deployment script to use new datafeed constructor parameters
- use authority address to deploy Governance to mainnet
- integrate initiation of Version by Governance into deployment
- anyone can shut down Fund of an already shut down Version

### Updated

- README.md installation instructions
- Thomson-Reuters datafeed address
- adjust datafeed tests to new constructor parameters

### Fixed

- remove double registration of MLN in registrar
- GNT address in info file
- bug deleting blockchain data in devchain script

## [0.5.0]

### Added

- high water mark calculation inside Fund (accounting)
- added Parity dev chain for local deployment and testing
- automatic documentation generation for Solidity contracts using Doxity
- docstrings for all relevant functions in contracts
- external bulk parsing contract to get Fund data for off-chain ranking (`Ranking.sol`)
- Simple risk management implementation using market price deviation (`RMMakeOrders.sol`)
- Governance implementation (proposal, approval and triggering actions for Version creation and shutdown)
- multisig functionality to Governance.sol
- script for initialising and funding predefined accounts for tests
- elliptic curve signing of Terms and Conditions to create a Fund
- `ModuleRegistrar.sol` to keep track of registered modules on-chain
- `SimpleCertifier.sol` dependency
- more Dapp tests
- Dappsys libraries (ds-group, ds-token, and their dependencies)
- live deployment configuration
- empty password file
- Parity localnode script
- pull request template

### Changed

- switch to Parity.js for deployment, contract interaction, and testing
- deploy scripts from web3 to parity.js
- Jasmine tests from web3 to parity.js
- using more permissive NoCompliance instead of regular Compliance module
- enforce rule that Fund names within a Version must be unique (using fund name mapping)
- modify tests to fit code alterations
- readme instructions to reflect latest deploy and testing steps
- documentation in PriceFeed
- simplify AssetRegistrar
- rename `sharePrice` to `highWaterMark` in Calculations struct
- rename `test/` to `tests/`
- accounting to include assets held on exchange (#227)

### Updated

- old docstrings in contract functions
- enforcing a newer Solidity compiler version (`^0.4.17`)
- improved terminology for prices inside `PriceFeed.sol`
- updated NPM scripts
- updated Install instructions readme

### Removed

- `Staked.sol` contract
- bulk data reading functions inside `AssetRegistrar.sol`
- `BackupOwned.sol` dependency
- remnants of `Logger.sol` contract
- `Permissioned.sol`
- `ExternalAdapter.sol`
- `Fundhistory.sol`
- testrpc for local deployment and testing
- web3 dependency for tests and deployment
- unnecessary functions in FundInterface.sol
- redundant code and unnecessary comments in tests
- failing post-conditions (changed to asserts)

### Fixed

- gas price checks in jasmine tests
- bugs in jasmine tests
- bug in risk management / simplemarket tests
- ds-test contract naming

## [0.4.0]

### Added

- Dapp suite for compilation, package management, testing
- new Logo
- [err, errMsg] style error logging
- Dapp (solidity) tests for more modules
- Main network deployment script
- Thomson-Reuters datafeed address
- Use OasisDex on main network
- better documentation (natspec)
- integrate oyente into our build process
- integrate dapp testing into our build process
- use Jasmine for JS testing
- use Web3 1.0 for contract deployment
- use Web3 1.0 to interact with contracts

### Updated

- refactor large parts of protocol
- refactor and redesign our tests
- installation instructions in README

### Removed

- deprecated truffle
- remove Mocha for testing
- logger contract

## [0.3.8]

### Added

- Added documentation for interaction
- Added documentation for modules
- Jasmine tests for main protocol functions

### Changed

- Using Dapp for tests
- Using Dapp for deployment
- Allow first supscription w/o waiting time;
- Prevent redeem w not sufficient shares
- Way how errors are logged
- redeemUsingSlice -> redeemOwnedAssets
- Refactor: Governance contract
- Refactor: Version contract
- Update README
- getFundById, getFundByManager functions in Version

### Removed

- Truffle components

## [0.3.6]

### Added

- Deployement specific network environments, inputted as a parameter
- Jasmine environment
- Soliditiy tests
- Jasmine tests
- Init VersionInterface; Simplified executeRequest
- Add calcSharePrice, getBaseUnits to fund interface
- Readme Intro text
- Readme ToC
- Readme Contribution section
- Readme New logo
- Readme Module section
- Introduce Staked contract
- Add two new parameteres to Version contract constructor
- Introduce concept of system contracts
- Introduce returnCriticalError, a function which shutsdown fund on error;
- Staked contract, as a way to have fund inheritance into staked fund

### Changed

- Reorder Order struct
- Rename numShares -> shareQuantity
- Change RiskMgmt interface to include order quadruple of buy/sell asset/quantity
- Refactoring dispatching of requests
- Refactor executeRequest and cancelRequst
- Request functions update natspec comments
- Cleaned up Version and Version Interface
- Cleaned up Governance
- Input ReferenceAsset in Fund, Version setup
- redeemOwnedAssets in (err,,msg) format
- natspecs comments
- Add (err,errMsg) format to PoE and manualSettlemnt
- quantityHeldInCustodyOfExchange() function to fix accounting issue
- Require only one fund per manager in setupFund function call

### Removed

-  Staking from Fund
- noOpenOrders in Fund
- getSupscriptionHistory, getFunds in Version
- Competition contract

### Fixed
- Fix #112
- Fix #125
- Fix #161
- Fix #148
- Fix VersionInterface inheritance in Version err
- Fix calculations in redeeumUsingSlice
- Fix calculations in convertUnclaimedRewards

## [0.3.4]

### Added

- Introduce the concept of an externalAdapter, that is an exchangeAdapter that can be used in conjunction w a sphere of subset externalCustodian and any kind of centralised exchange
- Introduce concept of basic subset of Melon fund; I.e. a coarse categorisation of the type of Melon fund - such as blockchainCustodian and externalCustodian
- Introduce concept of existsMakeOrder, i.e. whether there already is an open order for a given asset pair
- Added Dapp suite development environment
- Custom deployment script

### Changed

- Redesign of PoE
- Improve precision of PoE
- Naming consistency: numShares -> shareQuantity; Clean up natspecs comments
- Babel dependency
- uint256 for all exponents
- AssetRegistrar.remove post condition

### Fixed

- makeOrder error
- Linter errors

## [0.3.3]

### Added

- Introduce the concept of an externalAdapter, that is an exchangeAdapter that can be used in conjunction w a sphere of subset externalCustodian and any kind of centralised exchange
- Introduce concept of basic subset of Melon fund; I.e. a coarse categorisation of the type of Melon fund - such as blockchainCustodian and externalCustodian
- Introduce concept of existsMakeOrder, i.e. whether there already is an open order for a given asset pair

### Changed

- Redesign of PoE
- Improve precision of PoE
- Naming consistency: numShares -> shareQuantity; Clean up natspecs comments

### Removed

- Remove concept of openOrders; max open orders

## [0.3.2] - 2017-09-21

### Added
- Function to change descriptive information in asset registrar
- Contract draft for contribution
- FundHistory
- Interfaces
- ExchagneAdapter
- Actual implementation of SimpleMarket - OasisDex exchange
- InternalAccounting cleanup
- Natspecs comments
- Compliance example uPort
- Competition contract
- LogError event in Fund
- Gross asset calculations accounts for externally held assets

### Changed
- Naming: Vault -> Fund
- Naming: subscribe -> requestSubscription in Fund
- Naming: redeem -> requestRedemption in Fund
- Mappings to arrays where sensible

### Removed
- Information struct in Fund
- FundHistory dependency
- Logger

## Fixed
- Fixed: #104
- Fixed makeOrder issue

## [0.3.1]

### Added
- Introducing ability to shut down both Version and Funds.
- Implement functionality to get reference price of datafeed
- Refactor Risk Management parameters
- Adding new Risk Management module for making and taking orders based on a reference price
- Implement Proof Of Embezzlement

## [0.3.0]

### Added
- Logging contract for errors and other events
- AssetRegistrar Contract
- History tracking/retrieval for orders, requests, trades and datafeed
- Sphere module (exchange/pricefeed pairings)
- Optional manager-controlled whitelisting of investors
- Basic Fund decommissioning in Version
- Ability to prove embezzlement for transfers to/from exchange
- Manager staking
- A lot of tests

### Changed
- Use logging contract from most other contracts (e.g. Fund)
- Simplified tracking of Funds in Version contract
- Extend our own reference datafeed
- Default to MLN for internal accounting and initial investment
- Subscription now operates under request/execute paradigm

### Removed
- Universe module

## [0.2.1]

### Changed
- Naming in past tense for Events
  - `OrderUpdate` -> `OrderUpdated`
  - `FundUpdate` -> `FundUpdated`

## [0.2.0]

### Added
- Tokens: GNO, GNT, ICN, ANT, BAT, BNT, SNT, ETC, LTC, DOGE, AVT, XRP, SNGLS incl addresses and verified on EtherScan
- Second way to subscribe and redeem using referenceAsset directly in Fund

### Changed
- Refactor and re-write tests to have better coverage
- Fixed some code to use async/await instead of promises
- Increase amount of premined token
- From SafeMath contract to SafeMath library

## [0.1.3] - 2017-06-13

### Added
- Fund slice calculator
- method getting share price in reference asset
- ability to redeem shares in reference asset

### Fixed
- share creation using reference asset

## [0.1.2] - 2017-06-09

### Fixed
- publish command

## [0.1.1] - 2017-06-09
- no change

## [0.1.0] - 2017-06-09

### Added
- core protocol contracts
- build directory with compiled contracts
- migrations script
- truffle configuration file
- js test files with utils
- package.json (made this an NPM module)
