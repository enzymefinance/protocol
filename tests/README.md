# Melon Protocol Tests

This subdirectory contains the files used for testing a deployment of the Melon Protocol.

## Directory Structure

### Dependency folders

`contracts/` - contains smart contracts that are solely for testing purposes

`utils/` - contains utility functions that assist in performing common testing actions

### Test folders

`integration/` - contains files that test particular user or feature journies

`unit/` - contains test files that check inputs, outputs, and events of particular smart contracts

### Local vs. Testnet tests

Some tests that manipulate the evm - e.g., increasing next block time - will not work on testnets. These tests live in `local/` subdirectories to indicate that they will only run locally.

E.g., `tests/integration/local/performanceFee.test.js`
