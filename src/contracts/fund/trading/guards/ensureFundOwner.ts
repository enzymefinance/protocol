import { ensure } from '~/utils/guards';
import { getHub } from '~/contracts/fund/hub';
import { getGlobalEnvironment } from '~/utils/environment';
import { getContract } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const ensureFundOwner = async (
  spokeAddress,
  environment = getGlobalEnvironment(),
) => {
  const hubAddress = await getHub(spokeAddress, environment);
  const hubContract = getContract(Contracts.Hub, hubAddress);
  const manager = await hubContract.methods.manager().call();

  ensure(
    environment.wallet.address.toLowerCase() === manager.toLowerCase(),
    `The given account ${manager} is not the owner of the fund ${hubAddress}`,
  );
};

export { ensureFundOwner };
