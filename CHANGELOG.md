# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Tokens: GNO, GNT, ICN, ANT, BAT, BNT, SNT, ETC, LTC, DOGE, AVT, XRP, SNGLS
- Second way to subscribe and redeem using referenceAsset directly in Vault
- CryptoCompare price feed contract

### Changed
- Refactor and re-write tests to have better coverage

### Changed
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
