# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

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
- redeemUsingSlice in (err,,msg) format
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
- Participation example uPort
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
