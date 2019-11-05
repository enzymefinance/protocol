#!/usr/bin/env bash

. "./common.sh"

TRACK="KYBER_PRICE" # TODO: move to config
# TODO: upgrade the notation format for input file (e.g. not so much needless nesting)
D_IN="./deploy_in.json" # TODO: rename
D_OUT="./deploy_out.json" # TODO: rename

set -x

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

EthfinexAdapter=$(nab EthfinexAdapter)
KyberAdapter=$(nab KyberAdapter)
MatchingMarketAdapter=$(nab MatchingMarketAdapter)
MatchingMarketAccessor=$(nab MatchingMarketAccessor)
ZeroExV2Adapter=$(nab ZeroExV2Adapter)
EngineAdapter=$(nab EngineAdapter)

PriceTolerance=$(nab PriceTolerance $DEFAULT_PRICE_TOL)
UserWhitelist=$(nab UserWhitelist $DEFAULT_USER_WHITELIST)

ManagementFee=$(nab ManagementFee)
PerformanceFee=$(nab PerformanceFee)

AccountingFactory=$(nab AccountingFactory)
FeeManagerFactory=$(nab FeeManagerFactory)
ParticipationFactory=$(nab ParticipationFactory)
PolicyManagerFactory=$(nab PolicyManagerFactory)
SharesFactory=$(nab SharesFactory)
TradingFactory=$(nab TradingFactory)
VaultFactory=$(nab VaultFactory)

Registry=$(nab Registry $DEFAULT_REGISTRY_OWNER)
Engine=$(nab Engine $DEFAULT_ENGINE_DELAY $Registry)

FundRanking=$(nab FundRanking)

if [[ "$TRACK" == "KYBER_PRICE" ]]; then # TODO: consider less branching
  priceSource=$(nab KyberPriceFeed $Registry $DEFAULT_KYBER_NET_PROXY \
    $DEFAULT_KYBERFEED_MAX_SPREAD $DEFAULT_PRICEFEED_TOKEN)
elif [[ "$TRACK" == "TESTING" ]]; then
  priceSource=$(nab TestingPriceFeed $DEFAULT_PRICEFEED_TOKEN)
fi

# TODO: check whether these are already set correctly first
seth send $Registry 'setPriceSource(address)' $priceSource
seth send $Registry 'setNativeAsset(address)' $WETH
seth send $Registry 'setMlnToken(address)' $MLN
seth send $Registry 'setEngine(address)' $Engine
seth send $Registry 'setMGM(address)' $ETH_FROM # TODO: fill in correct address here
seth send $Registry 'setEthfinexWrapperRegistry(address)' $ETH_FROM # TODO: make correct

# TODO: check if fees registered
seth send $Registry 'registerFees(address[])' "[${ManagementFee#0x},${PerformanceFee#0x}]"

makeSig=$(seth sig 'makeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)')
takeSig=$(seth sig 'takeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)')
cancelSig=$(seth sig 'cancelOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)')
withdrawSig=$(seth sig 'withdrawTokens(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)')

# TODO: more sophisticated checking (do we really need to update?)
exchanges=$(jq -r '.exchangeConfigs | keys_unsorted[]' $D_IN)
for name in $exchanges; do
  adapter=$(jq -r ".exchangeConfigs.${name}.adapter" $D_IN)
  exchange=$(jq -r ".exchangeConfigs.${name}.exchange" $D_IN)
  takesCustody=$(jq -r ".exchangeConfigs.${name}.takesCustody" $D_IN)
  sigs="[${makeSig#0x},${takeSig#0x},${cancelSig#0x},${withdrawSig#0x}]"
  registered=$(seth call $Registry 'exchangeAdapterIsRegistered(address)(bool)' $adapter)
  if [[ "$registered" == true ]]; then
    seth send $Registry 'updateExchangeAdapter(address,address,bool,bytes4[])' \
      $exchange $adapter $takesCustody $sigs
  else
    seth send $Registry 'registerExchangeAdapter(address,address,bool,bytes4[])' \
      $exchange $adapter $takesCustody $sigs
  fi
done

syms=$(jq -r '.tokens | keys_unsorted[]' $D_IN)
for sym in $syms; do
  addr=$(jq -r ".tokens.${sym}.address" $D_IN)
  name=$(jq -r ".tokens.${sym}.name // empty" $D_IN)
  url=$(jq -r ".tokens.${sym}.url // empty" $D_IN)
  reserveMin=$(jq -r ".tokens.${sym}.reserveMin // 0" $D_IN)
  standards="[]"
  sigs="[]"
  registered=$(seth call $Registry 'assetIsRegistered(address)(bool)' $addr)
  if [[ "$registered" == false ]]; then
    seth send $Registry 'registerAsset(address,string,string,string,uint,uint[],bytes4[])' \
      "$addr" "$name" "$sym" "$url" "$reserveMin" "$standards" "$sigs"
  fi
  if [[ "$TRACK" == "TESTING" ]]; then
    seth send $priceSource 'setDecimals(uint)' "$asset" "$decimals"
  fi
done

version=$(nab Version $AccountingFactory $FeeManagerFactory \
  $ParticipationFactory $SharesFactory $TradingFactory $VaultFactory \
  $PolicyManagerFactory $Registry $DEFAULT_VERSION_OWNER)

# TODO: set price on whichever feed we are using
if [[ "$TRACK" == "KYBER_PRICE" ]]; then
  seth send $priceSource 'update()'
elif [[ "$TRACK" == "TESTING" ]]; then
  # TODO: get actual prices here and set them on testing feed
  seth send $priceSource 'update(address[],uint[])' 
  echo nothing
fi

cat > "./addrs.json" <<EOF
{
  "EthfinexAdapter": "$EthfinexAdapter",
  "KyberAdapter": "$KyberAdapter",
  "MatchingMarketAdapter": "$MatchingMarketAdapter",
  "MatchingMarketAccessor": "$MatchingMarketAccessor",
  "ZeroExV2Adapter": "$ZeroExV2Adapter",
  "EngineAdapter": "$EngineAdapter",
  "PriceTolerance": "$PriceTolerance",
  "UserWhitelist": "$UserWhitelist",
  "ManagementFee": "$PerformanceFee",
  "AccountingFactory": "$AccountingFactory",
  "FeeManagerFactory": "$FeeManagerFactory",
  "ParticipationFactory": "$ParticipationFactory",
  "PolicyManagerFactory": "$PolicyManagerFactory",
  "SharesFactory": "$SharesFactory",
  "TradingFactory": "$TradingFactory",
  "VaultFactory": "$VaultFactory",
  "Registry": "$Registry",
  "Engine": "$Engine",
  "FundRanking": "$FundRanking"
}
EOF
