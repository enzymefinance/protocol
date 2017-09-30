pragma solidity ^0.4.11;

import './Fund.sol';

/// @title Fund Staked Contract
/// @author Melonport AG <team@melonport.com>
/// @notice To allow for Melon fund assets to leave the reach of the blockchain
contract Staked is Fund {

    function increaseStake(uint shareQuantity)
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())
        pre_cond(isPastZero(shareQuantity))
        pre_cond(balancesOfHolderAtLeast(msg.sender, shareQuantity))
        post_cond(prevTotalSupply == totalSupply)
    {
        uint prevTotalSupply = totalSupply;
        subShares(msg.sender, shareQuantity);
        addShares(this, shareQuantity);
    }

    function decreaseStake(uint shareQuantity)
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())
        pre_cond(isPastZero(shareQuantity))
        pre_cond(balancesOfHolderAtLeast(this, shareQuantity))
        post_cond(prevTotalSupply == totalSupply)
    {
        uint prevTotalSupply = totalSupply;
        subShares(this, shareQuantity);
        addShares(msg.sender, shareQuantity);
    }
}
