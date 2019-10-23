#!/usr/bin/env bash

set -e

contracts_src="./src/contracts"

export DAPP_SRC="./temp_all_contracts"
export DAPP_OUT="./out"
export DAPP_SOLC_VERSION="0.4.25"
export SOLC_FLAGS="--optimize --optimize-runs=200" 
export DAPP_LIB='/dev/null' # just avoid libs

mkdir -p $DAPP_SRC
find $contracts_src -name '*.sol' | xargs -I{} cp {} $DAPP_SRC
find $DAPP_SRC -type f -exec sed -i 's/^import \"/import \"\.\//g' {} \;

dapp build --extract
