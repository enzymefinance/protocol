pragma solidity ^0.4.19;

import '../libraries/safeMath.sol';

// Fully functional calculation library
library rewards {
    using safeMath for uint;

    // VIEW METHODS

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
        uint absoluteChange = timeDifference.mul(gav);
        return absoluteChange.mul(managementRewardRate).div(divisorFee);
    }

    /// @dev Post Reward denominated in referenceAsset
    function performanceReward(
        uint performanceRewardRate,
        int deltaPrice, // Price Difference measured against referenceAsset
        uint totalSupply,
        uint divisorFee
    )
        constant
        returns (uint)
    {
        if (deltaPrice <= 0)
            return 0;
        uint absoluteChange = uint(deltaPrice).mul(totalSupply);
        return absoluteChange.mul(performanceRewardRate).div(divisorFee);
    }
}
