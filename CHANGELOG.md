# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [0.3.2]

### Added
- Fixed: #104

### Changed
- Naming: Vault -> Fund
- Naming: subscribe -> requestSubscription in Fund
- Naming: redeem -> requestRedemption in Fund

### Removed
- Information struct in Fund

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
