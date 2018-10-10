# Questions

- Use solcjs to compile?
  --> Does not work right now.
- Create own file (workflow) to compile all contracts with solcjs?
  --> At some point
- Commit ABI files? To github? To npm? (I think ABI files to both)
  --> As discussed with Sebastian: Deploy to NPM, but not to github, make a CI workflow to build and compare ABI files
- Commit BIN?
  --> Nope, also not to NPM
- Refactor ref (src) folder: /src/contracts and /src/utils?
  --> Done
- Move all deps from /ref to /src into /ref?
  --> Done

- Is there one FundFactory deployment per version?
- What is a PriceSource? Shouldnt it be named PriceSource.i.sol? Is PriceFeed an implementation of PriceSource?
- It helps to reimplement the whole logic in a functional way to have a different view on everything. (My Opinion)
- Talk about Token or Asset or AssetToken?
- What's the difference between /utils/deploy/contracts.js and /utils/deploy/refactorDeploy.js ?
- Can we have a rule: Every .sol file contains only one contract?

# Design goals:

- Do not expose web3.js contract objects to user

# TODOs:

- [ ] Remove babel, flow, eslint, ...


solc --optimize --optimize-runs=0 --overwrite --abi --bin --bin-runtime = -o out src/contracts/exchanges/MatchingMarket.sol

yarn babel-node utils/compile.js