# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## Unreleased

### Added
- Logging contract for errors and other events
- AssetRegistrar Contract
- History tracking/retrieval for orders, requests, trades and datafeed
- Sphere module (exchange/pricefeed pairings)
- Optional manager-controlled whitelisting of investors
- Basic Vault decommissioning in Version
- Ability to prove embezzlement for transfers to/from exchange
- Manager staking
- A lot of tests

### Changed
- Use logging contract from most other contracts (e.g. Vault)
- Simplified tracking of Vaults in Version contract
- Extend our own reference datafeed
- Default to MLN for internal accounting and initial investment
- Subscription now operates under request/execute paradigm

### Removed
- Universe module

## [0.2.1]

### Changed
- Naming in past tense for Events
  - `OrderUpdate` -> `OrderUpdated`
  - `VaultUpdate` -> `VaultUpdated`

## [0.2.0]
### Added
- Tokens: GNO, GNT, ICN, ANT, BAT, BNT, SNT, ETC, LTC, DOGE, AVT, XRP, SNGLS incl addresses and verified on EtherScan
- Second way to subscribe and redeem using referenceAsset directly in Vault

### Changed
- Refactor and re-write tests to have better coverage
- Fixed some code to use async/await instead of promises
- Increase amount of premined token
- From SafeMath contract to SafeMath library

## [0.1.3] - 2017-06-13
### Added
- Vault slice calculator
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
