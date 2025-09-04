# Enzyme Protocol: Testing

All test suites and helper contracts related to testing live in this directory.

All tests run on [Foundry](https://getfoundry.sh/).

## Test-writing rules

### Use of forks

All blocks used in forks should be defined in `utils/Constants.sol`, and follow the following rules:

- all test cases should use `ETHEREUM_BLOCK_LATEST`, unless the case will likely fail when the block is updated
- if only calculations change when moving to a new block (e.g., price feed), use `ETHEREUM_BLOCK_TIME_SENSITIVE`
- if case relies on specific block or time range (e.g., fixed term lending, pranking a specific holder), create a new variable in constants `ETHEREUM_BLOCK_TIME_SENSITIVE_MY_FEATURE`
- always import block variables, avoid defining blocks within test suites, so that we have a global view of all fork blocks in constants
- periodically update `ETHEREUM_BLOCK_LATEST`, `ETHEREUM_BLOCK_TIME_SENSITIVE`, and `ETHEREUM_BLOCK_TIME_SENSITIVE_MY_FEATURE` at intervals that make sense for maintainability
- if test suite requires bumping `ETHEREUM_BLOCK_LATEST` or `ETHEREUM_BLOCK_TIME_SENSITIVE` and things fail, can create a, e.g., `ETHEREUM_BLOCK_TIME_SENSITIVE_MY_FEATURE_TEMP`, which should be removed during the next global block var update

### Global Constants

[Constants.sol](/tests/utils/Constants.sol) provides hardcoded values that can be reused across test suites. Namely things like:

- all network blocks used in fork tests
- (per network) token addresses
- (per network) chainlink oracle addresses
- time shortcuts (e.g., `SECONDS_ONE_YEAR`)
- percentage shortcuts (e.g., `BPS_ONE_HUNDRED_PERCENT`)

Prefer adding to this list when reasonable.
