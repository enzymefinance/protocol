import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { getDeployment } from '~/utils/solidity/getDeployment';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts, requireMap } from '~/Contracts';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getFunctionABISignature } from '~/utils/abi/getFunctionABISignature';

const isOasisDexTakePermitted = async (
  tradingContractAddress,
  id,
  makerQuantity,
  takerQuantity,
  fillTakerTokenAmount,
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

  const matchingMarketAdapterAbi = requireMap[Contracts.MatchingMarketAdapter];
  const methodSignature = getFunctionABISignature(
    matchingMarketAdapterAbi,
    'takeOrder',
  );
  const deployment = await getDeployment(environment);
  const exchangeAddress = deployment.exchangeConfigs.find(
    o => o.name === 'MatchingMarket',
  ).exchangeAddress;

  const result = await policyManager.methods
    .preValidate(
      methodSignature, // bytes4(keccak256(methodSignature))
      [
        '0x0000000000000000000000000000000000000000', // orderAddresses[0],
        tradingAddress.toString(), // orderAddresses[1],
        makerQuantity.token.address, // orderAddresses[2],
        takerQuantity.token.address, // orderAddresses[3],
        exchangeAddress, // exchanges[exchangeIndex].exchange
      ],
      [
        makerQuantity.quantity.toString(), // orderValues[0],
        takerQuantity.quantity.toString(), // orderValues[1],
        fillTakerTokenAmount.quantity.toString(), // orderValues[6]
      ],
      `0x${Number(id)
        .toString(16)
        .padStart(64, '0')}`, // identifier
    )
    .call();

  return !!result;
};

export { isOasisDexTakePermitted };
