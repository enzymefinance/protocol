// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../IPrimitivePriceFeed.sol";

/// @title PrimitivePriceFeedBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice An abstract base contract for price feeds of primitives
abstract contract PrimitivePriceFeedBase is IPrimitivePriceFeed {
    uint256 internal constant RATE_PRECISION = 18;

    function getRatePrecision() external pure returns (uint256 ratePrecision_) {
        return RATE_PRECISION;
    }
}
