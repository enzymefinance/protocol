pragma solidity ^0.4.11;

import './safeMath.sol';

// Fully functional calculation library
library calculate {
    using safeMath for uint256;

    // CONSTANT METHODS - ACCOUNTING

    /// Pre:  baseUnitsPerShare not zero
    /// Post: priceInRef denominated in [base unit of melonAsset]
    function priceForNumBaseShares(
        uint256 numBaseShares,
        uint256 baseUnitsPerShare,
        uint256 value,
        uint256 totalSupply
    )
        constant
        returns (uint256)
    {
        uint256 sharePrice;
        if(totalSupply > 0)
            sharePrice = value.mul(baseUnitsPerShare).div(totalSupply);
        else
            sharePrice = baseUnitsPerShare;
        return numBaseShares.mul(sharePrice).div(baseUnitsPerShare);
    }

    /// Pre: Decimals in assets must be equal to decimals in PriceFeed for all entries in Universe
    /// Post: Gross asset value denominated in [base unit of melonAsset]
    function grossAssetValue(
        uint256[] holdings,
        uint256[] prices,
        uint256[] decimals
    )
        constant
        returns (uint256 result)
    {
        for(uint i; i < prices.length; i++) { //sum(holdings * prices /decimals)
            result = result.add(holdings[i].mul(prices[i]).div(10 ** uint(decimals[i])));
        }
    }

    /// Pre: Gross asset value and sum of all applicable and unclaimed fees has been calculated
    /// Post: Net asset value denominated in [base unit of melonAsset]
    function netAssetValue(
        uint256 gav,
        uint256 rewardsUnclaimed
    )
        constant
        returns (uint256)
    {
        return gav.sub(rewardsUnclaimed);
    }

    /* Function invariant
     *  for timeDifference == 0 => returns 0
     */
    /// Post: Reward denominated in referenceAsset
    function managementReward(
        uint managementRewardRate,
        uint timeDifference,
        uint gav,
        uint divisorFee
    )
        constant
        returns (uint)
    {
        uint absoluteChange = timeDifference * gav;
        return absoluteChange * managementRewardRate / divisorFee;
    }

    /* Function invariant
     *  for deltaDifference == 0 => returns 0
     */
    /// Post: Reward denominated in referenceAsset
    function performanceReward(
        uint performanceRewardRate,
        int deltaPrice,
        uint totalSupply,
        uint divisorFee
    )
        constant
        returns (uint)
    {
        if (deltaPrice <= 0) return 0;
        uint absoluteChange = uint(deltaPrice) * totalSupply;
        return absoluteChange * performanceRewardRate / divisorFee;
    }

    /// Pre: Gross asset value has been calculate
    /// Post: The sum and its individual parts of all applicable fees denominated in [base unit of melonAsset]
    function rewards(
        uint256 lastPayoutTime,
        uint256 currentTime,
        uint256 managementRewardRate,
        uint256 performanceRewardRate,
        uint256 gav,
        uint256 lastSharePrice,
        uint256 totalSupply,
        uint256 baseUnitsPerShare,
        uint256 divisorFee
    )
        constant
        returns (
            uint256 management,
            uint256 performance,
            uint256 unclaimed
        )
    {
        uint256 timeDifference = currentTime.sub(lastPayoutTime);
        management = managementReward(managementRewardRate, timeDifference, gav, divisorFee);
        if (totalSupply != 0) {
            uint256 currSharePrice = priceForNumBaseShares(baseUnitsPerShare, baseUnitsPerShare, gav, totalSupply);
            if (currSharePrice > lastSharePrice) {
                int deltaPrice = int(currSharePrice - lastSharePrice);
                performance = performanceReward(performanceRewardRate, deltaPrice, totalSupply, divisorFee);
            }
        }
        unclaimed = management.add(performance);
    }
}
