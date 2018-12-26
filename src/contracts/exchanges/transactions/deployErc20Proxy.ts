import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';

const deployErc20Proxy = async environment =>
  deployContract(environment, Contracts.ERC20Proxy, []);

export { deployErc20Proxy };
