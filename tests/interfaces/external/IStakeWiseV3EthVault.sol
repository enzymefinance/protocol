// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IStakeWiseV3EthVault Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IStakeWiseV3EthVault {
    struct HarvestParams {
        bytes32 rewardsRoot;
        int160 reward;
        uint160 unlockedMevReward;
        bytes32[] proof;
    }

    function balanceOf(address _account) external view returns (uint256 balance_);

    function convertToShares(uint256 _assets) external view returns (uint256 shares_);

    function convertToAssets(uint256 _shares) external view returns (uint256 assets_);

    function updateState(HarvestParams calldata harvestParams) external;
}
