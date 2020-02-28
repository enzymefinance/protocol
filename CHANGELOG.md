# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## Unreleased

### Added
- "Internal Accounting" (storage-based calculations of fund holdings)
- Standardized pipeline for takeOrder (OrderFiller + OrderTaker contracts)
- OrderFilled event (replaces ExchangeMethodCall)

### Removed
- EthfinexAdapter
- makeOrder and related functions/storage
- Vault component
- ExchangeMethodCall event

## 1.1.2

### Fixed

- double withdraw in UniswapAdapter

## 1.1.1

### Added

- setRegistry function on KyberPriceFeed

## 1.1.0

### Added

- Uniswap adapter
- 0xV3 adapter
- interfaces to third-party contracts
- allow anyone to continue setup of a fund

### Changed

- upgrade all contracts to solidity 0.6.1
- rename all interfaces to IInterfaceName
- trading function parameters (added bytes value and 2 addresses)
- move events from interfaces to contracts themselves
- use interfaces to third-party contracts instead of the contracts themselves
- do not track default investment assets as owned assets
- allow manager to add exchanges after fund setup
- allow anyone to cancel an expired investment request on behalf of another
- for 0xV3 fee assets, check that they are registered before trading
- use ask-side instead of bid-side to calculate spread in KyberPriceFeed
- move contracts only used in tests to tests directory
- improve revert messages for policy failures
- get pricefeed from registry dynamically and at fund runtime
- account for revoking approval from cancelled non-custodial orders

### Fixed

- prevent manager from triggering fee rewarding when redeeming their shares
- bug in calculating maxConcentration on makeOrder
- bug yielding price of 0 for WETH
- bug yielding incorrect price in cross-market condition
- default investment assets are not tracked as owned assets unless actually owned
- bug allowing orders unrelated to the intended order to be cancelled
- bug returning makerAsset and makerFeeAsset to vault when still in use
- bug allowing investor to avoid paying performance fees
- bug preventing partially-filled orders from being cancelled
- bug allowing fund manager to keep funds in Trading contract

### Removed

- third-party contracts
- FundRanking.sol
- CanonicalPriceFeed.sol
- CanonicalRegistrar.sol
- OperatorStaking.sol
- SimplePriceFeed.sol
- StakingPriceFeed.sol
- UpdatableFeed.i.sol

## 1.0.6

### Added

- Policy Manager
- Policy MaxPositions
- Policy Whitelist and Blacklist
- Policy PriceTolernace
- concept of Canonical PriceFeed
- concept of individually-updatable Simple PriceFeed(s)
- ability for manager to shut down invest/redeem for individual assets
- expiration date for orders
- account for approved assets when calculating custody of exchange
- get fund names in ranking contract
- PicopsCompliance module and tests
- MatchingMarket (from OasisDex)
- hardcoded compliance module for mainnet
- Competition contract and associated tests
- etherscan verification helper script
- README.md tracking deployed Versions
- tests to fit new protocol developments
- utils to use governance contract more easily
- Fund function to retrieve order ID by exchange/asset pair
- Canonical pricefeed is a staking pricefeed factory
- history to canonical pricefeed
- withdrawMln function to Competition contract callable by the owner

### Changed

- rename subscribe to invest
- simplify order struct inside the Fund
- reduce max fund assets
- use bytes32 for name instead of dynamic type
- push to ownedAssets when asset added
- allocate fees and calculate share price at same time
- use different ports for different deployment environments
- use object format for token addresses
- remove ERC223 code from Asset.sol (also changes event signatures)
- issue both ERC20 and ERC223 events from Shares.sol
- all unit tests to run non-serially
- add withdrawStake function to OperatorStaking
- add withdrawStake function to StakingPriceFeed
- introduce delay *after* unstake, needing another call to withdraw stake after delay
- Competition contract no longer relies on pricefeed / CHF asset price. Whitelist limit is denominated now in Ether.
- move `ds-*` modules to `dependencies/`

### Fixed

- bug allowing emergencyRedeem to drain funds
- bug where orderExpired returned `true` for invalid assets
- bug allowing stake/do something/unstake in one block
- inconsistencies like 'this vs address(this), '0x0 vs address(0), solidity version, event handling, functions ordering

### Updated

- deployment contract (use config file more)
- Asset struct in CanonicalRegistrar
- Exchange struct in CanonicalRegistrar

### Removed

- superfluous Fund functions (getLastOrderId, getNameHash)
- unnecessary governance functions (everything can be triggered with calldata)
- fund name tracking in Version
- StakeBank dependency from OperatorStaking
- StakeBank.sol contract
- CHFAsset from deployment
- Unused Weth9.t.sol

## [0.7.0]

### Added

- special case calculating holdings for "approve only" style exchanges
- special case for mainnet deployment (hardcoded compliance module)
- RestrictedShares.sol
- SimpleAdapterWithApprove.sol
- SimpleMarketWithApprove.sol
- MatchingMarket.sol (from OasisDex; mirroring live deployment)
- export some js modules for use in other projects
- concatenation script for etherscan verification
- secondaryTrading.js tests
- simpleMarketWithApprove.js tests

### Changed

- rename "base asset" to "quote asset"
- quote asset now always in Fund ownedAssets
- fund inherits RestrictedShares instead of Shares
- rename rewards to fees
- rename subscribe to invest
- change max allowed assets to 4
- removed ERC223 component from kovan and development network test assets we use
- made tests more modular (using utils libraries)
- introduce code size limit to our development network as well
- use different ports for different networks

### Fixed

- bug preventing emergencyRedeem for multiple assets
- bug in FundRanking preventing array from growing

### Updated

- terms and conditions hash
- test files, to be compatible with changes to contracts
- information files (tokenInfo.js and exchangeInfo.js)

### Removed

- fund name logic in Version.sol

## [0.6.4]

### Added

- utility modules for functions/cases used throughout tests and deployment
- several new tokens to pricefeed
- creation time tracking to FundRanking contract
- compliance module only permitting manager to invest

### Changed

- use updateId again to prevent subscribe/redeem arbitrage
- implement Asset as ERC223
- use new addresses for re-deployed ERC223 token contracts
- interface contracts are now actually solidity interface-type contracts
- slightly modify SimpleMarket to implement ERC223ReceivingContract

### Fixed

- prevent fund receiving tokens from non-exchange address (prevent inflation attack)

### Removed

- over-permissive recoverToken function
- factored out boilerplate code from tests and deployment

## [0.6.2]

### Added

- return inception date in ranking contract
- keep track of updateId in pricefeed
- check for two updates when executing a request

### Removed

- Fund.getStake()
- un-implemented interface functions
- duplicate ranking contract

### Changed

- use the same exchange on Kovan for each deployment, to maintain liquidity
- simplify return syntax in boolean functions

### Fixed

- Bug preventing state storage in Fund.cancelOrder
- Bug in GAV calculation for assets without 18 decimal places
- Bug in sharePrice calculation after taking orders

### Updated

- README.md
- CONTRIBUTING.md style and contribution guide


## [0.6.0]

### Added

- enforce eslint rules at build time
- enforce solium rules at build time
- test for module registrar
- compatibility with multiple exchange adapters
- account for funds held on multiple exchanges
- retries for network requests when updating pricefeed
- centralized exchange adapter
- test to redeem with malicious asset in fund
- sanity checks for cryptocompare prices
- native currency and reference asset as two ways to invest/redeem (plus tests)
- tokenFallback method to redeem (plus tests)
- NativeAssetInterface contract

### Changed

- enable some ava testfiles that were ignored
- restructure a bit to use the more modular files in `utils/`
- update solium linter rules to comply with our style
- make devchain script its own file, and run things more syncronously
- factor out some functions in tests
- change governance tests to unit tests
- run tests in parallel where possible
- deploy contracts for each testfiles to make them independent
- default to reference asset rather than Melon asset in Fund
- use AssetInterface and NativeAssetInterface in Fund
- allow manager to shut down execution of subscription and redemption

### Fixed

- linter errors in all js files
- linter errors in all solidity files
- add test for potential bug in calculations (#274)
- fix sometimes-failing build when db does not exist
- fix some missing or incorrect docstrings
- rename .abi files before publishing (#293)

### Updated

- update .eslintrc rules
- update .soliumrc.json rules
- travis-CI build script to make things more synchronous


## [0.5.4]

### Added

- Ava linter rules
- Ava test script
- cap to number of managed assets
- raise error if request type is invalid (Fund.sol)
- limitation on ownership of Fund namespace
- tests/integration for integration/walk though tests
- tests/mocks (for mocks during testing)
- tests/fixtures (e.g. data from cryptocompare)
- limitation of one fund per ethereum address, for simpler `migration` process of shutting down and creating fund
- Shares.sol (Asset.sol with information and helper functions for shares, as well as ability to create and annihilate shares)
- ds-tests for RMMakeOrders and moduleRegistrar
- Shares as erc223 asset
- zero-config premined asset

### Removed

- toggle type functions
- dead (unused) code in cancelOrder
- allow ownership changing (Owned.sol)
- unnecessary functions used as pre-conditions
- check asset is registered in pricefeed before allowing updates
- Sphere.sol
- EtherToken.sol
- safeMath.sol, rewards.sol libraries
- rewards deployment and linking

### Changed

- Use Ava as test runner instead of Jasmine
- move list of managed assets to Fund rather than DataFeed
- Separated utils from tests
- Governance tests to Ava
- integration tests moved to their own directory
- use ds-math instead of safeMath
- replace EtherToken with ds-weth
- allocate sufficient storage for IPFS hash
- use ds-math (safe math) contract in rewards
- pay incentive *after* redeeming shares
- rename DataFeed.sol to PriceFeed.sol
- move deployment configuration, information and script to utils/
- rewritten parts of `PriceFeed.sol`; adapted `(bool isRecent, uint price, uint decimal)` return format
- function visibility from `constant` to `view`
- Shares and fund precision is always 18
- Move reward calculation into fund
- Rewrite calcUnclaimedRewards()

### Fixed

- bug caused by not zeroing openMakeOrderId
- stop constant methods from trying to modify storage
- update nameExists mapping when name changed (ModuleRegistrar.sol)
- bug leading to accounting error
- bug allowing unlimited votes in ModuleRegistrar
- error using dynamic key in ModuleRegistrar mapping


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
- redeemUsingSlice -> redeemAllOwnedAssets
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
- redeemAllOwnedAssets in (err,,msg) format
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
- Fix calculations in allocateUnclaimedRewards

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
