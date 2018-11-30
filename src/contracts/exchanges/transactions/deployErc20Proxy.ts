import { deploy } from '~/utils/solidity/deploy';
import { Contracts } from '~/Contracts';

const deployErc20Proxy = async environment =>
  deploy(Contracts.ERC20Proxy, [], environment);

export { deployErc20Proxy };
