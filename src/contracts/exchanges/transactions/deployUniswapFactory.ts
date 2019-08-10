import { TokenInterface } from '@melonproject/token-math';

import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';
import { createUniswapExchange } from './createUniswapExchange';
import { Contracts } from '~/Contracts';

export interface DeployUniswapArgs {
  tokens: TokenInterface[];
}

export const deployUniswapFactory = async (
  environment: Environment,
  { tokens }: DeployUniswapArgs,
) => {
  const templateAddress = await deployContract(
    environment,
    Contracts.UniswapExchangeTemplate,
  );
  const factoryAddress = await deployContract(
    environment,
    Contracts.UniswapFactory,
  );
  await getContract(environment, Contracts.UniswapFactory, factoryAddress)
    .methods.initializeFactory(templateAddress.toLowerCase())
    .send({
      from: environment.wallet.address,
    });

  for (const token of tokens) {
    await createUniswapExchange(environment, factoryAddress, {
      token,
    });
  }

  return factoryAddress;
};
