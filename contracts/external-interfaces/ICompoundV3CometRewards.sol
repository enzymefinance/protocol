// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;
pragma experimental ABIEncoderV2;

/// @title ICompoundV3CometRewards Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @dev Source: https://github.com/compound-finance/comet/blob/main/contracts/CometRewards.sol
interface ICompoundV3CometRewards {
    struct RewardConfig {
        address token;
        uint64 rescaleFactor;
        bool shouldUpscale;
    }

    function claim(address _cToken, address _src, bool _shouldAccrue) external;

    function rewardConfig(address _cToken) external view returns (RewardConfig memory rewardConfig_);
}
