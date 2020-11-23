import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { defaultTestDeployment } from '@melonproject/testutils';
import { utils } from 'ethers';
import { IChai } from '../../release/dist/codegen/IChai';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);
  // Initialize chai mock
  const chaiMock = new IChai(config.derivatives.chai, config.deployer);
  return { accounts, deployment, config, mocks: { chai: chaiMock } };
}

it('correctly join with DAI and receives CHAI in exchange', async () => {
  const {
    config: { deployer },
    mocks: { chai },
    deployment: {
      tokens: { dai },
    },
  } = await provider.snapshot(snapshot);

  const preDaiBalance = await dai.balanceOf(deployer);
  const preChaiBalance = await chai.balanceOf(deployer);

  const amount = utils.parseEther('2');
  await dai.approve(chai, amount);
  await chai.mint(amount);

  const postDaiBalance = await dai.balanceOf(deployer);
  const postChaiBalance = await chai.balanceOf(deployer);

  // Calculate expected tokens given an initial rate of 2 Token/cToken
  const expectedCTokens = amount.div(2);

  expect(postDaiBalance).toEqBigNumber(preDaiBalance.sub(amount));
  expect(postChaiBalance).toEqBigNumber(preChaiBalance.add(expectedCTokens));
});

it('correctly exits receiving DAI in exchange', async () => {
  const {
    config: { deployer },
    mocks: { chai },
    deployment: {
      tokens: { dai },
    },
  } = await provider.snapshot(snapshot);

  // Start by minting some tokens
  const joinAmount = utils.parseEther('2');
  await dai.approve(chai, utils.parseEther('2'));
  await chai.join(joinAmount);

  // Get Balances and redeem received cTokens
  const preDaiBalance = await dai.balanceOf(deployer);
  const preChaiBalance = await chai.balanceOf(deployer);

  const exitAmount = preChaiBalance;
  await chai.approve(chai, utils.parseEther('2'));
  await chai.redeem(exitAmount);

  const postDaiBalance = await dai.balanceOf(deployer);
  const postChaiBalance = await chai.balanceOf(deployer);

  const expectedTokens = exitAmount.mul(2);

  expect(postDaiBalance).toEqBigNumber(preDaiBalance.add(expectedTokens));
  expect(postChaiBalance).toEqBigNumber(preChaiBalance.sub(exitAmount));
});
