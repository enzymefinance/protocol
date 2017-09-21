pragma solidity ^0.4.11;

// Fully functional calculation library
library rewards {

    // CONSTANT METHODS

    /* Function invariant
     *  for timeDifference == 0 => returns 0
     */
    /// @dev Post Reward denominated in referenceAsset
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
    /// @dev Post Reward denominated in referenceAsset
    function performanceReward(
        uint performanceRewardRate,
        int deltaPrice, // Price Difference measured agains referenceAsset
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
}
