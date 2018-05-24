pragma solidity ^0.4.21;

import "./SimplePriceFeed.sol";
import "../system/OperatorStaking.sol";
import "../assets/AssetInterface.sol";

/// @title Staking Price Feed
/// @author Melonport AG <team@melonport.com>
/// @notice Simple pricefeed that can increase and decrease stake
contract StakingPriceFeed is SimplePriceFeed {

    OperatorStaking public stakingContract;
    AssetInterface public stakingToken;

    // CONSTRUCTOR

    /// @param ofQuoteAsset Address of quote asset
    /// @param ofRegistrar Address of canonical registrar
    /// @param ofSuperFeed Address of superfeed
    function StakingPriceFeed(
        address ofRegistrar,
        address ofQuoteAsset,
        address ofSuperFeed
    )
        SimplePriceFeed(ofRegistrar, ofQuoteAsset, ofSuperFeed)
    {
        stakingContract = OperatorStaking(ofSuperFeed); // canonical feed *is* staking contract
        stakingToken = AssetInterface(stakingContract.stakingToken());
    }

    // EXTERNAL METHODS

    /// @param amount Number of tokens to stake for this feed
    /// @param data Data may be needed for some future applications (can be empty for now)
    function depositStake(uint amount, bytes data)
        external
        auth
    {
        require(stakingToken.transferFrom(msg.sender, address(this), amount));
        require(stakingToken.approve(stakingContract, amount));
        stakingContract.stake(amount, data);
    }

    /// @param amount Number of tokens to unstake for this feed
    /// @param data Data may be needed for some future applications (can be empty for now)
    function withdrawStake(uint amount, bytes data)
        external
        auth
    {
        stakingContract.unstake(amount, data);
        require(stakingToken.transfer(msg.sender, amount));
    }
}

