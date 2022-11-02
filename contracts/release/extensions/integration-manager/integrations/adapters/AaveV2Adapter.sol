// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../utils/actions/AaveV2ActionsMixin.sol";
import "../utils/bases/AaveAdapterBase.sol";

/// @title AaveV2Adapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for Aave v2 lending
contract AaveV2Adapter is AaveAdapterBase, AaveV2ActionsMixin {
    constructor(address _integrationManager, address _lendingPool)
        public
        AaveAdapterBase(_integrationManager)
        AaveV2ActionsMixin(_lendingPool)
    {}

    ////////////////////////////////
    // REQUIRED VIRTUAL FUNCTIONS //
    ////////////////////////////////

    /// @dev Logic to lend underlying for aToken
    function __lend(
        address _vaultProxy,
        address _underlying,
        uint256 _amount
    ) internal override {
        __aaveV2Lend({_recipient: _vaultProxy, _underlying: _underlying, _amount: _amount});
    }

    /// @dev Logic to redeem aToken for underlying
    function __redeem(
        address _vaultProxy,
        address _underlying,
        uint256 _amount
    ) internal override {
        __aaveV2Redeem({_recipient: _vaultProxy, _underlying: _underlying, _amount: _amount});
    }
}
