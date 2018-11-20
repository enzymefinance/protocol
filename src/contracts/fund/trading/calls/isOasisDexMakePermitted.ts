import { getGlobalEnvironment } from '~/utils/environment';
import { getContract, getDeployment } from '~/utils/solidity';
import { Contracts, requireMap } from '~/Contracts';
import { getHub, getSettings } from '~/contracts/fund/hub';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { getFunctionSignature } from '~/utils/abi';
import { getExchangeIndex } from '~/contracts/fund/trading/calls/getExchangeIndex';

const isOasisDexMakePermitted = async (
  tradingContractAddress,
  makerQuantity: QuantityInterface,
  takerQuantity: QuantityInterface,
  environment = getGlobalEnvironment(),
) => {
  const hubAddress = await getHub(tradingContractAddress, environment);
  const { policyManagerAddress, tradingAddress } = await getSettings(
    hubAddress,
    environment,
  );

  // TODO: Jenna said we need this later!
  //
  // const priceFeedContract = await getContract(
  //   Contracts.TestingPriceFeed,
  //   priceSourceAddress,
  //   environment,
  // );

  // const orderPrice = await priceFeedContract.methods.getOrderPriceInfo(
  //   makerQuantity.token.address,
  //   takerQuantity.token.address,
  //   makerQuantity.quantity,
  //   takerQuantity.quantity,
  // ).call();

  const policyManager = await getContract(
    Contracts.PolicyManager,
    policyManagerAddress,
    environment,
  );

  const matchingMarketAbi = requireMap[Contracts.MatchingMarket];
  const methodSignature = getFunctionSignature(matchingMarketAbi, 'makeOrder');
  const deployment = await getDeployment(environment);
  const exchangeAddress = deployment.find(o => o.name === 'MatchingMarket')
    .exchangeAddress;

  const exchangeIndex = await getExchangeIndex(
    exchangeAddress,
    tradingAddress,
    environment,
  );

  const result = await policyManager.methods
    .isMakePermitted(
      methodSignature, // bytes4(keccak256(methodSignature))
      [
        tradingAddress, // orderAddresses[0],
        '0x0000000000000000000000000000000000000000', // orderAddresses[1],
        makerQuantity.token.address, // orderAddresses[2],
        takerQuantity.token.address, // orderAddresses[3],
        exchangeIndex, // exchanges[exchangeIndex].exchange
      ],
      [
        makerQuantity.quantity.toString(), // orderValues[0],
        takerQuantity.quantity.toString(), // orderValues[1],
        '0', // orderValues[6]
      ],
      '0x0', // identifier
    )
    .call();

  return !!result;
};

export { isOasisDexMakePermitted };
