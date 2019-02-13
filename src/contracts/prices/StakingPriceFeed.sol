pragma solidity ^0.4.25;

import "SimplePriceFeed.sol";
import "OperatorStaking.sol";
import "ERC20.i.sol";

/// @title Staking Price Feed
/// @author Melonport AG <team@melonport.com>
/// @notice Simple pricefeed that can increase and decrease stake
contract StakingPriceFeed is SimplePriceFeed {

    OperatorStaking public stakingContract;
    ERC20 public stakingToken;

    // CONSTRUCTOR

    /// @param ofQuoteAsset Address of quote asset
    /// @param ofRegistrar Address of canonical registrar
    /// @param ofSuperFeed Address of superfeed
    constructor(
        address ofRegistrar,
        address ofQuoteAsset,
        address ofSuperFeed
    )
        public
        SimplePriceFeed(ofRegistrar, ofQuoteAsset, ofSuperFeed)
    {
        stakingContract = OperatorStaking(ofSuperFeed); // canonical feed *is* staking contract
        stakingToken = ERC20(stakingContract.stakingToken());
    }

    // EXTERNAL METHODS

    /// @param amount Number of tokens to stake for this feed
    /// @param data Data may be needed for some future applications (can be empty for now)
    function depositStake(uint amount, bytes data)
        external
        auth
    {
        require(
            stakingToken.transferFrom(msg.sender, address(this), amount),
            "Transferring staking token to fee failed"
        );
        require(
            stakingToken.approve(stakingContract, amount),
            "Approving staking token for staking contract failed"
        );
        stakingContract.stake(amount, data);
    }

    /// @param amount Number of tokens to unstake for this feed
    /// @param data Data may be needed for some future applications (can be empty for now)
    function unstake(uint amount, bytes data)
        external
        auth
    {
        stakingContract.unstake(amount, data);
    }

    function withdrawStake()
        external
        auth
    {
        uint amountToWithdraw = stakingContract.stakeToWithdraw(address(this));
        stakingContract.withdrawStake();
        require(
            stakingToken.transfer(msg.sender, amountToWithdraw),
            "Staking token transfer to sender failed"
        );
    }
}
