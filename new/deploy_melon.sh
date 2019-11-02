#!/usr/bin/env bash

set -e

TRACK="KYBER_PRICE" # TODO: move to config
# TODO: upgrade the notation format for input file (e.g. not so much needless nesting)
D_IN="./deploy_in.json" # TODO: rename
D_OUT="./deploy_out.json" # TODO: rename

trap 'printf "Errored on line $LINENO\n"' ERR

rm -f "$D_OUT" # TODO: make this more sensible

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

set -x

# export SETH_CHAIN="kovan"
export ETH_FROM="0xbe1ac5962e318d0335b8d8aabff55dc4bad01826"
export ETH_PASSWORD="./passfile" # TODO: come up with a solution for this
export ETH_KEYSTORE="./allkeys" # TODO: come up with a solution for this
export ETH_GAS=8000000

WETH=$ETH_FROM # TODO: dummy; actually get this from config
MLN=$ETH_FROM # TODO: dummy; actually get this from config

# TODO: get this stuff from input
DEFAULT_PRICE_TOL=10
DEFAULT_USER_WHITELIST="[${ETH_FROM#0x}]"
DEFAULT_REGISTRY_OWNER=$ETH_FROM
DEFAULT_ENGINE_DELAY=2592000
DEFAULT_KYBER_NET_PROXY=$ETH_FROM # TODO: dummy
DEFAULT_KYBERFEED_MAX_SPREAD=$(seth --to-uint256 $(seth --to-wei 0.1 eth))
DEFAULT_PRICEFEED_TOKEN=$WETH
DEFAULT_VERSION_OWNER=$ETH_FROM # should be in config or something

# TODO: for most of these, get the contract if we don't need to deploy
ethfinexAdapter=$(nab '.melonContracts.adapters.ethfinexAdapter' EthfinexAdapter)
kyberAdapter=$(nab '.melonContracts.adapters.kyberAdapter' KyberAdapter)
matchingMarketAdapter=$(nab '.melonContracts.adapters.matchingMarketAdapter' MatchingMarketAdapter)
matchingMarketAccessor=$(nab '.melonContracts.adapters.matchingMarketAccessor' MatchingMarketAccessor)
zeroExV2Adapter=$(nab '.melonContracts.adapters.zeroExAdapter' ZeroExV2Adapter)
engineAdapter=$(nab '.melonContracts.adapters.engineAdapter' EngineAdapter)

priceTolerance=$(nab '.melonContracts.policies.priceTolerance' PriceTolerance $DEFAULT_PRICE_TOL)
userWhitelist=$(nab '.melonContracts.policies.userWhitelist' UserWhitelist $DEFAULT_USER_WHITELIST)

managementFee=$(nab '.melonContracts.fees.managementFee' ManagementFee)
performanceFee=$(nab '.melonContracts.fees.performanceFee' PerformanceFee)

accountingFactory=$(nab '.melonContracts.factories.accountingFactory' AccountingFactory)
feeManagerFactory=$(nab '.melonContracts.factories.feeManagerFactory' FeeManagerFactory)
participationFactory=$(nab '.melonContracts.factories.participationFactory' ParticipationFactory)
policyManagerFactory=$(nab '.melonContracts.factories.policyManagerFactory' PolicyManagerFactory)
sharesFactory=$(nab '.melonContracts.factories.sharesFactory' SharesFactory)
tradingFactory=$(nab '.melonContracts.factories.tradingFactory' TradingFactory)
vaultFactory=$(nab '.melonContracts.factories.vaultFactory' VaultFactory)

registry=$(nab '.melonContracts.registry' Registry $DEFAULT_REGISTRY_OWNER)
engine=$(nab '.melonContracts.engine' Engine $DEFAULT_ENGINE_DELAY $registry)

fundRanking=$(nab '.melonContracts.ranking' FundRanking)

if [[ "$TRACK" == "KYBER_PRICE" ]]; then # TODO: consider less branching
  priceSource=$(nab '.melonContracts.priceSource' KyberPriceFeed \
    $registry \
    $DEFAULT_KYBER_NET_PROXY \
    $DEFAULT_KYBERFEED_MAX_SPREAD \
    $DEFAULT_PRICEFEED_TOKEN)
elif [[ "$TRACK" == "TESTING" ]]; then
  priceSource=$(nab '.melonContracts.priceSource' TestingPriceFeed $DEFAULT_PRICEFEED_TOKEN)
fi

# TODO: check whether these are already set correctly first
seth send $registry 'setPriceSource(address)' $priceSource
seth send $registry 'setNativeAsset(address)' $WETH
seth send $registry 'setMlnToken(address)' $MLN
seth send $registry 'setEngine(address)' $engine
seth send $registry 'setMGM(address)' $ETH_FROM # TODO: fill in correct address here
seth send $registry 'setEthfinexWrapperRegistry(address)' $ETH_FROM # TODO: make correct

# TODO: check if fees registered
seth send $registry 'registerFees(address[])' "[${managementFee#0x},${performanceFee#0x}]"

# TODO: move above? does it matter if we set this up before the sends just prior?
version=$(nab '.melonContracts.version' Version \
  $accountingFactory $feeManagerFactory $participationFactory $sharesFactory \
  $tradingFactory $vaultFactory $policyManagerFactory $registry \
  $DEFAULT_VERSION_OWNER)

makeSig=$(seth sig 'makeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)')
takeSig=$(seth sig 'takeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)')
cancelSig=$(seth sig 'cancelOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)')
withdrawSig=$(seth sig 'withdrawTokens(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)')

# TODO: more sophisticated checking (do we really need to update?)
exchanges=$(jq -r '.exchangeConfigs | keys[]' $D_IN)
for name in $exchanges; do
  adapter=$(jq -r --arg n "$name" '.exchangeConfigs[$n].adapter' $D_IN)
  exchange=$(jq -r --arg n "$name" '.exchangeConfigs[$n].exchange' $D_IN)
  takesCustody=$(jq -r --arg n "$name" '.exchangeConfigs[$n].takesCustody' $D_IN)
  sigs="[${makeSig#0x},${takeSig#0x},${cancelSig#0x},${withdrawSig#0x}]"
  registered=$(seth call $registry 'exchangeAdapterIsRegistered(address)(bool)' $adapter)
  if [[ "$registered" == true ]]; then
    seth send $registry 'updateExchangeAdapter(address,address,bool,bytes4[])' \
      $exchange $adapter $takesCustody $sigs
  else
    seth send $registry 'registerExchangeAdapter(address,address,bool,bytes4[])' \
      $exchange $adapter $takesCustody $sigs
  fi
done

syms=$(jq -r '.thirdPartyContracts.tokens | keys[]' $D_IN)
for sym in $syms; do
  addr=$(jq -r --arg s "$sym" '.thirdPartyContracts.tokens[$s].address' $D_IN)
  name=$(jq -r --arg s "$sym" '.thirdPartyContracts.tokens[$s].name // empty' $D_IN)
  url=$(jq -r --arg s "$sym" '.thirdPartyContracts.tokens[$s].url // empty' $D_IN)
  reserveMin=$(jq -r --arg s "$sym" '.thirdPartyContracts.tokens[$s].reserveMin // 0' $D_IN)
  standards="[]"
  sigs="[]"
  registered=$(seth call $registry 'assetIsRegistered(address)(bool)' $addr)
  if [[ "$registered" == false ]]; then
    seth send $registry 'registerAsset(address,string,string,string,uint,uint[],bytes4[])' \
      "$addr" "$name" "$sym" "$url" "$reserveMin" "$standards" "$sigs"
  fi
  if [[ "$TRACK" == "TESTING" ]]; then
    seth send $priceSource 'setDecimals(uint)' "$asset" "$decimals"
  fi
done

# TODO: set price on whichever feed we are using
if [[ "$TRACK" == "KYBER_PRICE" ]]; then
  seth send $priceSource 'update()'
elif [[ "$TRACK" == "TESTING" ]]; then
  # TODO: get actual prices here and set them on testing feed
  echo nothing
fi

