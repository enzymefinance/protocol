#!/usr/bin/env bash

. "./common.sh"

TRACK="KYBER_PRICE" # TODO: move to config
# TODO: upgrade the notation format for input file (e.g. not so much needless nesting)
D_IN="./deploy_in.json" # TODO: rename
D_OUT="./deploy_out.json" # TODO: rename

export ETH_FROM="0xbe1ac5962e318d0335b8d8aabff55dc4bad01826"
export ETH_PASSWORD="./passfile" # TODO: come up with a solution for this
export ETH_KEYSTORE="./allkeys" # TODO: come up with a solution for this
export ETH_GAS=8000000

WETH=$(nabx 'WETH' WETH)
MLN=$(nabx 'tokens.MLN.address' BurnableToken "MLN" 18 "Melon Token")
BAT=$(nabx 'tokens.BAT.address' PreminedToken "BAT" 18 "")
DAI=$(nabx 'tokens.DAI.address' PreminedToken "DAI" 18 "")
DGX=$(nabx 'tokens.DGX.address' PreminedToken "DGX" 9 "")
KNC=$(nabx 'tokens.KNC.address' PreminedToken "KNC" 18 "")
MKR=$(nabx 'tokens.MKR.address' PreminedToken "MKR" 18 "")
REP=$(nabx 'tokens.REP.address' PreminedToken "REP" 18 "")
ZRX=$(nabx 'tokens.ZRX.address' PreminedToken "ZRX" 18 "")

cat > "./token_addrs.json" <<EOF
{
  "WETH": "$WETH",
  "MLN": "$MLN",
  "BAT": "$BAT",
  "DAI": "$DAI",
  "DGX": "$DGX",
  "KNC": "$KNC",
  "MKR": "$MKR",
  "REP": "$REP",
  "ZRX": "$ZRX",
}
EOF
