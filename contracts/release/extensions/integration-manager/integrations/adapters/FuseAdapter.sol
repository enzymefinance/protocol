// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../interfaces/IFuseComptroller.sol";
import "../../../../interfaces/IFuseRewardsDistributor.sol";
import "../utils/bases/CompoundAdapterBase.sol";

/// @title FuseAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for Fuse <https://app.rari.capital/fuse>
contract FuseAdapter is CompoundAdapterBase {
    constructor(
        address _integrationManager,
        address _fusePriceFeed,
        address _wethToken
    ) public CompoundAdapterBase(_integrationManager, _fusePriceFeed, _wethToken) {}

    /// @notice Claims rewards from the Fuse rewards distributor
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function claimRewards(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata
    ) external override onlyIntegrationManager {
        (address[] memory cTokens, address poolComptroller) = __decodeClaimArgs(_actionData);
        address[] memory rewardsDistributors = IFuseComptroller(poolComptroller)
            .getRewardsDistributors();

        for (uint256 i; i < rewardsDistributors.length; i++) {
            IFuseRewardsDistributor(rewardsDistributors[i]).claimRewards(_vaultProxy, cTokens);
        }
    }

    /// @dev Helper to decode callArgs for claimRewards
    function __decodeClaimArgs(bytes memory _actionData)
        private
        pure
        returns (address[] memory cTokens_, address poolComptroller_)
    {
        return abi.decode(_actionData, (address[], address));
    }
}
