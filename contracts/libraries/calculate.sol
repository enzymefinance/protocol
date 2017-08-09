pragma solidity ^0.4.11;

import "./safeMath.sol";

library calculate {
    using safeMath for uint256;
    // CONSTANT METHODS - ACCOUNTING

    /// Pre: value denominated in [base unit of melonAsset]
    /// Post: Share price denominated in [base unit of melonAsset * base unit of share / base unit of share] == [base unit of melonAsset]
    function pricePerShare(
        uint256 value,
        uint256 baseUnitsPerShare,
        uint256 totalSupply
    )
        constant
        returns (uint256)
    {
        if(totalSupply > 0) return value.mul(baseUnitsPerShare).div(totalSupply);
        else return baseUnitsPerShare;
    }

    /// Pre: numShares denominated in [base unit of melonAsset], baseUnitsPerShare not zero
    /// Post: priceInRef denominated in [base unit of melonAsset]
    function priceForNumShares(
        uint256 numShares,
        uint256 baseUnitsPerShare,
        uint256 nav,
        uint256 totalSupply
    )
        constant
        returns (uint256)
    {
        uint256 sharePrice = pricePerShare(nav, baseUnitsPerShare, totalSupply);
        return numShares.mul(sharePrice).div(baseUnitsPerShare);
    }

    /// Pre: numShares denominated in [base unit of melonAsset], baseUnitsPerShare not zero
    /// Post: priceInRef denominated in [base unit of melonAsset]
    function subscribePriceForNumShares(
        uint256 numShares,
        uint256 baseUnitsPerShare,
        uint256 subscriptionFee,
        uint256 feeDivisor,
        uint256 nav,
        uint256 totalSupply
    )
        constant
        returns (uint256)
    {
        return priceForNumShares(numShares, baseUnitsPerShare, nav, totalSupply)
            .mul(feeDivisor.sub(subscriptionFee))
            .div(feeDivisor); // [base unit of melonAsset]
    }

    /// Pre: Decimals in assets must be equal to decimals in PriceFeed for all entries in Universe
    /// Post: Gross asset value denominated in [base unit of melonAsset]
    function grossAssetValue(
        uint256[] storage holdings,
        uint256[] storage prices,
        uint256[] storage decimals
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
        uint sharePriceDifference,
        uint totalSupply,
        uint divisorFee
    )
        constant
        returns (uint)
    {
        if (sharePriceDifference <= 0) return 0;
        uint absoluteChange = sharePriceDifference * totalSupply;
        return absoluteChange * performanceRewardRate / divisorFee;
    }

    /// Pre: Gross asset value has been calculated
    /// Post: The sum and its individual parts of all applicable fees denominated in [base unit of melonAsset]
    function rewards(
        uint256 lastPayoutTime,
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
        uint256 timeDifference = now.sub(lastPayoutTime);
        management = managementReward(managementRewardRate, timeDifference, gav, divisorFee);
        if (totalSupply != 0) {
            uint256 currSharePrice = pricePerShare(gav, baseUnitsPerShare, totalSupply);
            if (currSharePrice > lastSharePrice) {
                uint256 deltaPrice = currSharePrice - lastSharePrice;
                performance = performanceReward(performanceRewardRate, deltaPrice, totalSupply, divisorFee);
            }
        }
        unclaimed = management.add(performance);
    }
}
