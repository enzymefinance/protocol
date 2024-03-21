// SPDX-License-Identifier: GPL-3.0

import {IPendleV2StandardizedYield} from "./IPendleV2StandardizedYield.sol";
import {IPendleV2YieldToken} from "./IPendleV2YieldToken.sol";

pragma solidity >=0.6.0 <0.9.0;

/// @title IPendleV2Market Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPendleV2Market {
    struct MarketState {
        int256 totalPt;
        int256 totalSy;
        int256 totalLp;
        address treasury;
        int256 scalarRoot;
        uint256 expiry;
        uint256 lnFeeRateRoot;
        uint256 reserveFeePercent;
        uint256 lastLnImpliedRate;
    }

    function expiry() external view returns (uint256 expiry_);

    function observe(uint32[] memory _secondsAgos) external view returns (uint216[] memory lnImpliedRateCumulative_);

    function readState(address _router) external view returns (MarketState memory market_);

    function readTokens()
        external
        view
        returns (IPendleV2StandardizedYield sy_, address pt_, IPendleV2YieldToken yt_);
}
