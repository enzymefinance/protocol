# Goal

Flexible tool to deploy to different tracks in different chains.

# Requirements

- Deployment-config as JSON (?)
- Constructor args in deployment config
- Possibility to create full deplyoment (devchain, virgin chain)
- Possibility to create partial deployments:
  - Using contracts by third-parties like exchanges, tokens, ...
  - Only updating some contracts. For example: New version with new FundFactory, but same engine, ...
- Reproduction of deployment
- Differentiation between concrete contract and interface: Example: PriceFeed. In deployment we just specify `priceSource`. That could be `KyberPriceFeed` or `CanonicalPriceFeed`.

# Use cases

- Deploy a test system: All contracts
- Deploy an initial version: Given 3rd party contracts
- Deploy a new version: Some former contracts are given

# Caveats

- Difference between deployment and version and fund
- Order of deployment
- Transactions other than contract deployments (i.e. whitelisting, ...)
- Reusing parts of code
- Not all deployed addresses should be exposed. For example: feeManagerFactoryAddress is only needed for the FundFactory.

# 3 Fundamental solution paths:

- Deployment configs as task list in JSON -> deployment.json
- Hybrid between config & outcome
- Code only

# Scratchpad

## Queue

Assumptions:

- Unlocked node

```json
{
  "track": "development",
  "queue": [
    {
      "type": "deploy", //
      "contract": "PreminedToken",
      "args": ["WETH", 18, "Wrapped Eth Token"],
      "name": "tokens.WETH",
      "public": true
    },
    {
      "type": "deploy",
      "contract": "TestingPriceFeed",
      "args": ["@tokens.WETH"],
      "name": "priceSource",
      "public": true
    }
    // ...
  ]
}
```

=>

```json
{
  "version": "", // some deterministic versioning!
  "track": "development",
  "queue": [
    {
      "type": "deploy", //
      "contract": "PreminedToken",
      "args": ["WETH", 18, "Wrapped Eth Token"],
      "name": "tokens.WETH",
      "public": true,
      "address": "0x123"
    }
    // ...
  ],
  // Only deployments marked as public are reflected here
  "deployment": {
    "priceSource": {
      "contract": "TestingPriceFeed",
      "address": "0x234"
    },
    "tokens": {
      "WETH": {
        "contract": "PreminedToken",
        "address": "0x123"
      }
    }
  }
}
```
