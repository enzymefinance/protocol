#!/usr/bin/env bash

set -e

TRACK="KYBER_PRICE" # TODO: move to config
# TODO: upgrade the notation format for input file (e.g. not so much needless nesting)
D_IN="./deploy_in.json" # TODO: rename
D_OUT="./deploy_out.json" # TODO: rename

trap 'printf "Errored on line $LINENO\n"' ERR

jot() {
  printf "%s\t%s\n" $1 $2 >> $D_OUT
}

# get address from input, or create it
nab() {
  addr=$(jq -r $1 "$D_IN")
  if [[ -z $addr ]]; then
    addr=$(dapp create "${@:2}")
  fi
  jot $1 $addr
  echo $addr
}

# export SETH_CHAIN="kovan"
export ETH_FROM="0xbe1ac5962e318d0335b8d8aabff55dc4bad01826"
export ETH_PASSWORD="./passfile" # TODO: come up with a solution for this
export ETH_KEYSTORE="./allkeys" # TODO: come up with a solution for this
export ETH_GAS=8000000

WETH=$(nab '.thirdPartyContracts.tokens.WETH.address' WETH)
MLN=$(nab '.thirdPartyContracts.tokens.MLN.address' BurnableToken \
  "MLN" 18 "Melon Token")
BAT=$(nab '.thirdPartyContracts.tokens.BAT.address' PreminedToken \
  "BAT" 18 "")
DAI=$(nab '.thirdPartyContracts.tokens.DAI.address' PreminedToken \
  "DAI" 18 "")
DGX=$(nab '.thirdPartyContracts.tokens.DGX.address' PreminedToken \
  "DGX" 9 "")
KNC=$(nab '.thirdPartyContracts.tokens.KNC.address' PreminedToken \
  "KNC" 18 "")
MKR=$(nab '.thirdPartyContracts.tokens.MKR.address' PreminedToken \
  "MKR" 18 "")
REP=$(nab '.thirdPartyContracts.tokens.REP.address' PreminedToken \
  "REP" 18 "")
ZRX=$(nab '.thirdPartyContracts.tokens.ZRX.address' PreminedToken \
  "ZRX" 18 "")
