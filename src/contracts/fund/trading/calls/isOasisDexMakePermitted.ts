import * as Web3EthAbi from 'web3-eth-abi';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { getDeployment } from '~/utils/solidity/getDeployment';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { FunctionSignatures } from '../utils/FunctionSignatures';

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

  const deployment = await getDeployment(environment);
  const exchangeAddress = deployment.exchangeConfigs.find(
    o => o.name === 'MatchingMarket',
  ).exchangeAddress;

  const result = await policyManager.methods
    .preValidate(
      Web3EthAbi.encodeFunctionSignature(FunctionSignatures.makeOrder),
      [
        tradingAddress.toString(), // orderAddresses[0],
        '0x0000000000000000000000000000000000000000', // orderAddresses[1],
        makerQuantity.token.address, // orderAddresses[2],
        takerQuantity.token.address, // orderAddresses[3],
        exchangeAddress, // exchanges[exchangeIndex].exchange
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
