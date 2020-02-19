## Third party contracts

Stopgap solution to avoid compiling third-party contracts with our own.

The contract binaries and ABIs are all compiled from source using the
code at [this commit](https://github.com/melonproject/protocol/tree/43cc73b9568cc03a985f0495737c16e29ff07744).

A couple contracts from that commit were renamed here, namely:

- `Exchange` -> `ZeroExV2Exchange`
- `MatchingMarket` -> `OasisDexExchange`

### TODO: remove/ignore this directory and file when we have a script that solves this issue more elegantly
