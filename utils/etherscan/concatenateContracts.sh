#!/bin/bash
set -ex

srcpath="./src"
outputpath="./utils/etherscan/concatenated"
contracts=(
  "Fund.sol" "version/Version.sol" "riskmgmt/RMMakeOrders.sol"
  "compliance/NoCompliance.sol" "compliance/OnlyManager.sol"
  "pricefeeds/PriceFeed.sol" "system/Governance.sol"
)

mkdir -p outputpath

for contract in "${contracts[@]}"
do
  echo "Concatenating $srcpath/$contract"
  solidity_flattener \
    $srcpath/$contract \
    --output=$outputpath/$(basename $contract) \
    --solc-allow-paths="$(pwd)" \
    $(dapp remappings | xargs -I{} echo --solc-paths={} | tr "\n" " ")
done
