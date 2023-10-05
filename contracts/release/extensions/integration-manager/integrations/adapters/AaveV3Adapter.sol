// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {AaveV3ActionsMixin} from "../utils/0.6.12/actions/AaveV3ActionsMixin.sol";
import {AaveAdapterBase} from "../utils/0.6.12/bases/AaveAdapterBase.sol";

/// @title AaveV3Adapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for Aave v3 lending
contract AaveV3Adapter is AaveAdapterBase, AaveV3ActionsMixin {
    constructor(
        address _integrationManager,
        address _addressListRegistry,
        uint256 _aTokenListId,
        address _pool,
        uint16 _referralCode
    )
        public
        AaveAdapterBase(_integrationManager, _addressListRegistry, _aTokenListId)
        AaveV3ActionsMixin(_pool, _referralCode)
    {}

    ////////////////////////////////
    // REQUIRED VIRTUAL FUNCTIONS //
    ////////////////////////////////

    /// @dev Logic to lend underlying for aToken
    function __lend(address _vaultProxy, address _underlying, uint256 _amount) internal override {
        __aaveV3Lend({_recipient: _vaultProxy, _underlying: _underlying, _amount: _amount});
    }

    /// @dev Logic to redeem aToken for underlying
    function __redeem(address _vaultProxy, address _underlying, uint256 _amount) internal override {
        __aaveV3Redeem({_recipient: _vaultProxy, _underlying: _underlying, _amount: _amount});
    }
}
