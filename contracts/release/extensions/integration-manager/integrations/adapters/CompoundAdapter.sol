// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../external-interfaces/ICompoundComptroller.sol";
import "../utils/bases/CompoundAdapterBase.sol";

/// @title CompoundAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for Compound <https://compound.finance/>
contract CompoundAdapter is CompoundAdapterBase {
    constructor(address _integrationManager, address _compoundPriceFeed, address _wethToken)
        public
        CompoundAdapterBase(_integrationManager, _compoundPriceFeed, _wethToken)
    {}

    /// @notice Claims rewards from Compound's Comptroller
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function claimRewards(address _vaultProxy, bytes calldata _actionData, bytes calldata)
        external
        override
        onlyIntegrationManager
    {
        (address[] memory cTokens, address compoundComptroller) = __decodeClaimArgs(_actionData);
        ICompoundComptroller(compoundComptroller).claimComp(_vaultProxy, cTokens);
    }

    /// @dev Helper to decode callArgs for claimRewards
    function __decodeClaimArgs(bytes memory _actionData)
        private
        pure
        returns (address[] memory cTokens_, address compoundComptroller_)
    {
        return abi.decode(_actionData, (address[], address));
    }
}
