#!/usr/bin/env bash

set -e

# TODO: put all this in a "common.sh" or something so we don't have boilerplate
TRACK="KYBER_PRICE" # TODO: move to config
DEPLOY_IN="./conf.json" # TODO: rename
DEPLOY_OUT="./deployment.json" # TODO: rename

# TODO: make trap command to write partial deployment somewhere?

export ETH_FROM="0xbe1ac5962e318d0335b8d8aabff55dc4bad01826"
export ETH_PASSWORD=./passfile
export ETH_KEYSTORE=./allkeys
export ETH_GAS=8000000

CONVERSION_RATE_ADMIN="$ETH_FROM"
KYBER_NETWORK_ADMIN="$ETH_FROM"
RATE_DURATION=500
MINIMAL_RECORD_RESOLUTION=2
MAX_PER_BLOCK_IMBALANCE=$(seth --to-uint256 $(bc <<< "10^29"))
MAX_TOTAL_IMBALANCE=$(seth --to-uint256 $(bc <<< "12*10^29"))

kgtToken=$(dapp create TestToken 'KGT' 'KGT' 18)
EUR=$(dapp create TestToken 'EUR' 'EUR' 18) # TODO: should be from config
MLN=$kgtToken # TODO: should be from config

conversionRates=$(dapp create ConversionRates $CONVERSION_RATE_ADMIN)
kyberNetwork=$(dapp create KyberNetwork $KYBER_NETWORK_ADMIN)
# if this mysteriously doesn't work, maybe kyberReserve deployment need to be after enabling token trades
# TODO: delete this info if it does work
kyberReserve=$(dapp create KyberReserve $kyberNetwork $conversionRates $ETH_FROM)
kyberWhiteList=$(dapp create KyberWhiteList $ETH_FROM $kgtToken)
feeBurner=$(dapp create 'FeeBurner' $ETH_FROM $MLN $kyberNetwork)
expectedRate=$(dapp create ExpectedRate $kyberNetwork $ETH_FROM)
kyberNetworkProxy=$(dapp create KyberNetworkProxy $ETH_FROM)

set -x

seth send $kyberNetworkProxy 'setKyberNetworkContract(address)' $kyberNetwork
seth send $kyberNetwork 'setWhiteList(address)' $kyberWhiteList
seth send $kyberNetwork 'setExpectedRate(address)' $expectedRate
seth send $kyberNetwork 'setFeeBurner(address)' $feeBurner
seth send $kyberNetwork 'setKyberProxy(address)' $kyberNetworkProxy
seth send $kyberNetwork 'setEnable(bool)' true

seth send $conversionRates 'setValidRateDurationInBlocks(uint)' $RATE_DURATION
seth send $conversionRates 'addToken(address)' $MLN
seth send $conversionRates 'setTokenControlInfo(address,uint,uint,uint)' \
  $MLN $MINIMAL_RECORD_RESOLUTION $MAX_PER_BLOCK_IMBALANCE $MAX_TOTAL_IMBALANCE
seth send $conversionRates 'enableTokenTrade(address)' $MLN
seth send $conversionRates 'setReserveAddress(address)' $kyberReserve
seth send $kyberNetwork 'addReserve(address,bool)' $kyberReserve true
seth send $kyberReserve 'approveWithdrawAddress(address,address,bool)' $MLN $ETH_FROM true
seth send $kyberReserve 'enableTrade()'

amtToTransfer=$(seth --to-uint256 $(bc <<< "10^23"))
seth send $MLN 'transfer(address,uint)' $kyberReserve $amtToTransfer

tokensPerEther=$(seth --to-uint256 $(seth --to-wei 1 eth))
ethersPerToken=$(seth --to-uint256 $(seth --to-wei 1 eth))

seth send $conversionRates 'addOperator(address)' $ETH_FROM
seth send $conversionRates \
  'setBaseRate(address[],uint[],uint[],bytes14[],bytes14[],uint,uint[])' \
  "[${MLN#0x}]" "[$tokensPerEther]" "[$ethersPerToken]" \
  "[0000000000000000000000000000]" "[0000000000000000000000000000]" \
  $(seth block-number) "[0]"
seth send $conversionRates 'setQtyStepFunction(address,int[],int[],int[],int[])' \
  $MLN "[0]" "[0]" "[0]" "[0]" 
seth send $conversionRates 'setImbalanceStepFunction(address,int[],int[],int[],int[])' \
  $MLN "[0]" "[0]" "[0]" "[0]" 

seth send $kyberWhiteList 'addOperator(address)' $ETH_FROM
seth send $kyberWhiteList 'setCategoryCap(uint,uint)' 0 $(seth --to-uint256 $(bc <<< "10^28"))
seth send $kyberWhiteList 'setSgdToEthRate(uint)' 30000

seth send $kyberReserve --value $(bc <<< "10^22")
seth send $kyberReserve 'setContracts(address,address,address)' \
  $kyberNetwork $conversionRates '0x0000000000000000000000000000000000000000'
seth send $kyberNetwork 'listPairForReserve(address,address,bool,bool,bool)' \
  $kyberReserve $MLN true true true

# TODO: just do this EUR in a loop with MLN above
seth send $conversionRates 'addToken(address)' $EUR
seth send $conversionRates 'setTokenControlInfo(address,uint,uint,uint)' \
  $EUR $MINIMAL_RECORD_RESOLUTION $MAX_PER_BLOCK_IMBALANCE $MAX_TOTAL_IMBALANCE
seth send $conversionRates 'enableTokenTrade(address)' $EUR
seth send $kyberReserve 'approveWithdrawAddress(address,address,bool)' $EUR $ETH_FROM true
seth send $EUR 'transfer(address,uint)' $kyberReserve $amtToTransfer
seth send $conversionRates \
  'setBaseRate(address[],uint[],uint[],bytes14[],bytes14[],uint,uint[])' \
  "[${EUR#0x}]" "[$tokensPerEther]" "[$ethersPerToken]" \
  "[0000000000000000000000000000]" "[0000000000000000000000000000]" \
  $(seth block-number) "[0]"
seth send $conversionRates 'setQtyStepFunction(address,int[],int[],int[],int[])' \
  $EUR "[0]" "[0]" "[0]" "[0]" 
seth send $conversionRates 'setImbalanceStepFunction(address,int[],int[],int[],int[])' \
  $EUR "[0]" "[0]" "[0]" "[0]" 
seth send $kyberNetwork 'listPairForReserve(address,address,bool,bool,bool)' \
  $kyberReserve $EUR true true true

jq -n \
  --arg cr "$conversionRates" \
  --arg kn "$kyberNetwork" \
  --arg kp "$kyberNetworkProxy" \
  '{ConversionRates: $cr, KyberNetwork: $kn, KyberNetworkProxy: $kp}' > $DEPLOY_OUT
