// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title ISharePriceThrottledAssetManagerLib Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ISharePriceThrottledAssetManagerLib {
    struct Throttle {
        // `cumulativeLoss`: the cumulative loss to the fund's share price, as a percentage,
        // after previous losses were replenished according to `lossTolerancePeriodDuration`
        uint64 cumulativeLoss;
        // `lastLossTimestamp`: the timestamp of the last loss to the fund's share price,
        // and thus also the last time `cumulativeLoss` was updated
        uint64 lastLossTimestamp;
    }

    function init(
        address _owner,
        address _vaultProxyAddress,
        uint64 _lossTolerance,
        uint32 _lossTolerancePeriodDuration,
        address _shutdowner
    ) external;
}
