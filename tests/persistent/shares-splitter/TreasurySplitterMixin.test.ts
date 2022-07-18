import type { AddressLike } from '@enzymefinance/ethers';
import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import { ITestStandardToken, ONE_HUNDRED_PERCENT_IN_BPS, TestTreasurySplitterMixin } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, deployProtocolFixture, getAssetUnit, seedAccount } from '@enzymefinance/testutils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';

const randomAddressValue1 = randomAddress();
const randomAddressValue2 = randomAddress();

let fork: ProtocolDeployment;
let testTreasurySplitterMixin: TestTreasurySplitterMixin;

beforeEach(async () => {
  fork = await deployProtocolFixture();

  testTreasurySplitterMixin = await TestTreasurySplitterMixin.deploy(fork.deployer);
  // Split ratio is not yet set at this point
});

describe('__setSplitRatio', () => {
  const feePercent1 = 2500;
  const feePercent2 = 7500;
  let user1Address: AddressLike, user2Address: AddressLike;

  beforeEach(async () => {
    user1Address = randomAddressValue1;
    user2Address = randomAddressValue2;
  });

  it('does not allow empty user', async () => {
    await expect(
      testTreasurySplitterMixin.setSplitRatio([user1Address, constants.AddressZero], [feePercent1, feePercent2]),
    ).rejects.toBeRevertedWith('Empty user');
  });

  it('does not allow duplicate user', async () => {
    await expect(
      testTreasurySplitterMixin.setSplitRatio([user1Address, user1Address], [feePercent1, feePercent2]),
    ).rejects.toBeRevertedWith('Duplicate user');
  });

  it('does not allow a bad split ratio', async () => {
    // Over 100%
    await expect(
      testTreasurySplitterMixin.setSplitRatio([user1Address, user2Address], [feePercent1, feePercent2 + 1]),
    ).rejects.toBeRevertedWith('Split not 100%');

    // Under 100%
    await expect(
      testTreasurySplitterMixin.setSplitRatio([user1Address, user2Address], [feePercent1, feePercent2 - 1]),
    ).rejects.toBeRevertedWith('Split not 100%');
  });

  it('works as expected', async () => {
    const receipt = await testTreasurySplitterMixin.setSplitRatio(
      [user1Address, user2Address],
      [feePercent1, feePercent2],
    );

    // Assert the split ratio is correctly set
    expect(await testTreasurySplitterMixin.getSplitPercentageForUser(user1Address)).toEqBigNumber(feePercent1);
    expect(await testTreasurySplitterMixin.getSplitPercentageForUser(user2Address)).toEqBigNumber(feePercent2);

    // Assert the expected events were correctly emitted
    const events = extractEvent(receipt, 'SplitPercentageSet');

    expect(events.length).toBe(2);
    expect(events[0]).toMatchEventArgs({
      percentage: feePercent1,
      user: user1Address,
    });
    expect(events[1]).toMatchEventArgs({
      percentage: feePercent2,
      user: user2Address,
    });
  });
});

describe('claimTokenAmountTo', () => {
  const user2Address = randomAddressValue1;
  const recipient = randomAddressValue2;
  const feePercent1 = 2500;
  const feePercent2 = 7500;
  let user: SignerWithAddress;
  let token: ITestStandardToken;
  let initialSplitterTokenBal: BigNumber;

  beforeEach(async () => {
    [user] = fork.accounts;

    await testTreasurySplitterMixin.setSplitRatio([user, user2Address], [feePercent1, feePercent2]);

    token = new ITestStandardToken(fork.config.primitives.usdc, provider);

    initialSplitterTokenBal = await getAssetUnit(token);
    await seedAccount({ account: testTreasurySplitterMixin, amount: initialSplitterTokenBal, provider, token });
  });

  it('does not allow an amount greater than claimable', async () => {
    // Attempting to claim more than user's share should fail
    await expect(
      testTreasurySplitterMixin.connect(user).claimTokenAmountTo(token, initialSplitterTokenBal, recipient),
    ).rejects.toBeRevertedWith('_amount exceeds claimable');
  });

  it('works as expected (partial claim)', async () => {
    // Claim part of user's claimable amount
    const userClaimableAmount = await testTreasurySplitterMixin.getTokenBalClaimableForUser(user, token);
    const amountToClaim = userClaimableAmount.div(4);

    // Claim a specific amount of tokens for user
    const receipt = await testTreasurySplitterMixin.connect(user).claimTokenAmountTo(token, amountToClaim, recipient);

    // Assert recipient received the correct amount of tokens
    expect(await token.balanceOf(recipient)).toEqBigNumber(amountToClaim);

    // Assert claiming user has the correct claimable token amount remaining
    expect(await testTreasurySplitterMixin.getTokenBalClaimableForUser(user, token)).toEqBigNumber(
      userClaimableAmount.sub(amountToClaim),
    );

    // Assert expected event
    assertEvent(receipt, 'TokenClaimed', {
      amount: amountToClaim,
      token,
      user,
    });
  });
});

// claimToken() tested in Walkthrough below

describe('Walkthrough', () => {
  it('works with multiple claims and token top-ups', async () => {
    const [user1, user2] = fork.accounts;
    const feePercent1 = 2500;
    const feePercent2 = 7500;
    const token = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const tokenUnit = await getAssetUnit(token);

    // Set the desired split ratio
    await testTreasurySplitterMixin.setSplitRatio([user1, user2], [feePercent1, feePercent2]);

    // Get the initial token balances of both users
    const initialUser1TokenBal = await token.balanceOf(user1);
    const initialUser2TokenBal = await token.balanceOf(user2);

    // Seed the splitter with some of a token to claim
    const initialSplitterTokenBal = tokenUnit;
    await seedAccount({ account: testTreasurySplitterMixin, amount: initialSplitterTokenBal, provider, token });

    // Validate the claimable amount for each user
    const user1ClaimableAmount = await testTreasurySplitterMixin.getTokenBalClaimableForUser(user1, token);

    expect(user1ClaimableAmount).toEqBigNumber(
      initialSplitterTokenBal.mul(feePercent1).div(ONE_HUNDRED_PERCENT_IN_BPS),
    );
    const user2ClaimableAmount = await testTreasurySplitterMixin.getTokenBalClaimableForUser(user2, token);

    expect(user2ClaimableAmount).toEqBigNumber(
      initialSplitterTokenBal.mul(feePercent2).div(ONE_HUNDRED_PERCENT_IN_BPS),
    );

    // Claim a specific amount of tokens for user1
    const user1AmountToClaim = user1ClaimableAmount.div(4);

    await testTreasurySplitterMixin.connect(user1).claimTokenAmountTo(token, user1AmountToClaim, user1);

    // Validate user1 received the correct amount of tokens and has the correct amount remaining
    expect(await token.balanceOf(user1)).toEqBigNumber(initialUser1TokenBal.add(user1AmountToClaim));
    expect(await testTreasurySplitterMixin.getTokenBalClaimableForUser(user1, token)).toEqBigNumber(
      user1ClaimableAmount.sub(user1AmountToClaim),
    );

    // Validate user2 still has the same amount of tokens remaining
    expect(await testTreasurySplitterMixin.getTokenBalClaimableForUser(user2, token)).toEqBigNumber(
      user2ClaimableAmount,
    );

    // Add the same amount of tokens to the splitter, doubling the cumulative total amount
    const testTreasurySplitterMixinBal = await token.balanceOf(testTreasurySplitterMixin);
    await seedAccount({
      account: testTreasurySplitterMixin,
      amount: testTreasurySplitterMixinBal.add(initialSplitterTokenBal),
      provider,
      token,
    });
    const cumulativeTotalBal = initialSplitterTokenBal.mul(2);

    // Validate that user1 and user2 are owed the correct amounts
    expect(await testTreasurySplitterMixin.getTokenBalClaimableForUser(user1, token)).toEqBigNumber(
      cumulativeTotalBal.mul(feePercent1).div(ONE_HUNDRED_PERCENT_IN_BPS).sub(user1AmountToClaim),
    );
    expect(await testTreasurySplitterMixin.getTokenBalClaimableForUser(user2, token)).toEqBigNumber(
      cumulativeTotalBal.mul(feePercent2).div(ONE_HUNDRED_PERCENT_IN_BPS),
    );

    // Claim all tokens for both users
    await testTreasurySplitterMixin.connect(user1).claimToken(token);
    await testTreasurySplitterMixin.connect(user2).claimToken(token);

    // Assert the final balances match the expected cumulative split
    const user1CumulativeTokensExpected = cumulativeTotalBal.mul(feePercent1).div(ONE_HUNDRED_PERCENT_IN_BPS);

    expect(await token.balanceOf(user1)).toEqBigNumber(initialUser1TokenBal.add(user1CumulativeTokensExpected));
    const user2CumulativeTokensExpected = cumulativeTotalBal.mul(feePercent2).div(ONE_HUNDRED_PERCENT_IN_BPS);

    expect(await token.balanceOf(user2)).toEqBigNumber(initialUser2TokenBal.add(user2CumulativeTokensExpected));
  });
});
