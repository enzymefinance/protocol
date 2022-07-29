import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ConvexCurveLpStakingWrapperFactory } from '@enzymefinance/protocol';
import { ConvexCurveLpStakingWrapperLib, ITestConvexBooster, ITestStandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, deployProtocolFixture, setAccountBalance } from '@enzymefinance/testutils';
import { constants } from 'ethers';

let factory: ConvexCurveLpStakingWrapperFactory;
let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();

  factory = fork.deployment.convexCurveLpStakingWrapperFactory;
});

describe('deploy', () => {
  it('does not allow a pid that already has a wrapper', async () => {
    const pid = 25; // steth

    // Deployment succeeds
    await factory.deploy(pid);

    // Re-deploying for the same pid fails
    await expect(factory.deploy(pid)).rejects.toBeRevertedWith('Wrapper already exists');
  });

  it('works as expected', async () => {
    const pid = 25; // steth
    const receipt = await factory.deploy(pid);

    const wrapperAddress = await factory.getWrapperForConvexPool(pid);

    expect(wrapperAddress).not.toMatchAddress(constants.AddressZero);

    const wrapperContract = new ConvexCurveLpStakingWrapperLib(wrapperAddress, provider);

    const convexBooster = new ITestConvexBooster(fork.config.convex.booster, provider);
    const poolInfo = await convexBooster.poolInfo(pid);

    expect(await wrapperContract.getConvexPool()).toMatchAddress(poolInfo.crvRewards);
    expect(await wrapperContract.getConvexPoolId()).toEqBigNumber(pid);
    expect(await wrapperContract.getCurveLpToken()).toMatchAddress(poolInfo.lptoken);

    assertEvent(receipt, 'WrapperDeployed', {
      curveLpToken: poolInfo.lptoken,
      pid,
      wrapperProxy: wrapperAddress,
    });
  });
});

describe('pause', () => {
  const depositAmount = 123;
  let wrapperContract: ConvexCurveLpStakingWrapperLib;
  let factoryOwner: SignerWithAddress, randomUser: SignerWithAddress;
  let lpToken: ITestStandardToken;

  beforeEach(async () => {
    [randomUser] = fork.accounts;
    factoryOwner = fork.deployer;

    const pid = 25; // steth

    await factory.deploy(pid);

    const wrapperAddress = await factory.getWrapperForConvexPool(pid);

    expect(wrapperAddress).not.toMatchAddress(constants.AddressZero);

    wrapperContract = new ConvexCurveLpStakingWrapperLib(wrapperAddress, provider);

    // Seed LP tokens to randomUser and pre-approve deposit
    lpToken = new ITestStandardToken(fork.config.curve.pools.steth.lpToken, provider);
    await setAccountBalance({ provider, account: randomUser, amount: depositAmount, token: lpToken });
    await lpToken.connect(randomUser).approve(wrapperContract, depositAmount);
  });

  describe('pauseWrappers', () => {
    it('does not allow a random caller', async () => {
      await expect(factory.connect(randomUser).pauseWrappers([wrapperContract])).rejects.toBeRevertedWith(
        'Only the owner can call this function',
      );
    });

    it('happy path', async () => {
      // Pause
      await factory.connect(factoryOwner).pauseWrappers([wrapperContract]);

      // Deposits are not allowed
      await expect(wrapperContract.connect(randomUser).deposit(depositAmount)).rejects.toBeRevertedWith('Paused');
    });
  });

  describe('unpauseWrappers', () => {
    it('does not allow a random caller', async () => {
      await expect(factory.connect(randomUser).unpauseWrappers([wrapperContract])).rejects.toBeRevertedWith(
        'Only the owner can call this function',
      );
    });

    it('happy path', async () => {
      // Pause
      await factory.connect(factoryOwner).pauseWrappers([wrapperContract]);

      // Deposits are not allowed
      await expect(wrapperContract.connect(randomUser).deposit(depositAmount)).rejects.toBeRevertedWith('Paused');

      // Unpause
      await factory.connect(factoryOwner).unpauseWrappers([wrapperContract]);

      // Deposits are allowed
      await wrapperContract.connect(randomUser).deposit(depositAmount);
    });
  });
});
