import web3EthAbi from 'web3-eth-abi';
import { Address, QuantityInterface } from '@melonproject/token-math';

import { getContract } from '~/utils/solidity/getContract';
import { Contracts, Exchanges } from '~/Contracts';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { Environment } from '~/utils/environment/Environment';

const isTakePermitted = async (
  environment: Environment,
  tradingContractAddress: Address,
  exchangeName: Exchanges,
  makerQuantity: QuantityInterface,
  takerQuantity: QuantityInterface,
  fillTakerQuantity: QuantityInterface,
  id?: number,
) => {
  const hubAddress = await getHub(environment, tradingContractAddress);
  const { policyManagerAddress, tradingAddress } = await getRoutes(
    environment,
    hubAddress,
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
    environment,
    Contracts.PolicyManager,
    policyManagerAddress,
  );

  const exchangeAddress =
    environment.deployment.exchangeConfigs[exchangeName].exchange;

  const result = await policyManager.methods
    .preValidate(
      web3EthAbi.encodeFunctionSignature(FunctionSignatures.takeOrder),
      [
        '0x0000000000000000000000000000000000000000', // orderAddresses[0],
        tradingAddress.toString(), // orderAddresses[1],
        makerQuantity.token.address.toString(), // orderAddresses[2],
        takerQuantity.token.address.toString(), // orderAddresses[3],
        exchangeAddress.toString(), // exchanges[exchangeIndex].exchange
      ],
      [
        makerQuantity.quantity.toString(), // orderValues[0],
        takerQuantity.quantity.toString(), // orderValues[1],
        fillTakerQuantity.quantity.toString(), // orderValues[6]
      ],
      id
        ? `0x${Number(id)
            .toString(16)
            .padStart(64, '0')}`
        : '0x0', // identifier
    )
    .call();

  return !!result;
};

export { isTakePermitted };
