# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## Unreleased

### Added
- Logging contract for errors and other events
- Calculations library
- Libraries folder
- Added dataHistory mapping in DataFeed contract
- Enum Status to Version contract
- Enum OrderStatus, VaultStatus to Vault contract
- Vault internal tracking of all orders
- Function `subscribe` in Vault
- `AssetRegistrar` Contract
- Function `getDataHistory` in DataFeed

### Changed
- Use Logging contract from Vault
- `..Protocol.sol` renamed to either `..Interface.sol` or `..Adapter.sol`
- `RiskMgmtV1.sol` renamed to `RMLiquididtyProvider.sol`
- `numAssignedAssets` renamed to `numRegisteredAssets`
- `event Trade(uint sell_how_much, address indexed sell_which_token,
    uint buy_how_much, address indexed buy_which_token);`
    to `event Trade(address indexed seller, uint sell_how_much, address indexed sell_which_token,
    address indexed buyer, uint buy_how_much, address indexed buy_which_token);`
- Changed DataUpdated Event
- Simplified Tracking of Vaults in Version contract
- DataFeed contract; `getFrequncey` -> `getInterval`
- Exchange Event `OrderUpdate` -> `ItemUpdate`
- Exchange Interface `take(..)` -> `buy(..)`
- `isRedeemPermitted(..)` -> `isRedeemRequestPermitted(..)`
- `isSubscribePermitted(..)` -> `isSubscribeRequestPermitted(..)`

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
