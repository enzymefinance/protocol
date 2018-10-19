This directory is used to store the concatenated contracts to verify on etherscan.

### Usage

Modify the list of contracts to be joined in `concatenateContracts.sh`.

`npm run concatenate`

Output is in `./concatenated`.

With the current version of etherscan's verifier, you may need to use the "beta" version.
In this version, you can enter the "runs" parameter, which is `0` for our compilations.

### Previous versions

Version Name     | Address                                     | Active            |
-----------------|---------------------------------------------|-------------------|
0.7.0            | 0x931Dddf00c66C132FC6452F546e8a0e831685F70  | True (Bug Bounty) |
0.7.0 *(testing)*| 0x3E516824A408c7029C3f870510D59442143c2Db9  | Shut down         |
0.6.6-alpha.15   | 0x2e6d6d288b80107A1b549681A3725f778A46775A  | Shut down         |
