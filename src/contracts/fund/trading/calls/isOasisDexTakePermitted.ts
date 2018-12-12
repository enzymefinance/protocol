import web3EthAbi from 'web3-eth-abi';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts, Exchanges } from '~/Contracts';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { Environment } from '~/utils/environment/Environment';
import { Address } from '@melonproject/token-math/address';
import { QuantityInterface } from '@melonproject/token-math/quantity';

const isOasisDexTakePermitted = async (
  environment: Environment,
  tradingContractAddress: Address,
  id: number,
  makerQuantity: QuantityInterface,
  takerQuantity: QuantityInterface,
  fillTakerTokenAmount: QuantityInterface,
) => {
  const hubAddress = await getHub(environment, tradingContractAddress);
  const { policyManagerAddress, tradingAddress } = await getSettings(
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
    environment.deployment.exchangeConfigs[Exchanges.MatchingMarket].exchange;

  const result = await policyManager.methods
    .preValidate(
      web3EthAbi.encodeFunctionSignature(FunctionSignatures.takeOrder),
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
