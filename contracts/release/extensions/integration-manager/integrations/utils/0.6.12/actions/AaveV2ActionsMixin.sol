// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {IAaveV2LendingPool} from "../../../../../../../external-interfaces/IAaveV2LendingPool.sol";
import {AssetHelpers} from "../../../../../../../utils/0.6.12/AssetHelpers.sol";

/// @title AaveV2ActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the Aave v2 lending functions
abstract contract AaveV2ActionsMixin is AssetHelpers {
    uint16 internal constant AAVE_V2_REFERRAL_CODE = 158;

    IAaveV2LendingPool internal immutable AAVE_V2_LENDING_POOL_CONTRACT;

    constructor(address _lendingPool) public {
        AAVE_V2_LENDING_POOL_CONTRACT = IAaveV2LendingPool(_lendingPool);
    }

    /// @dev Helper to execute lending on Aave v2
    function __aaveV2Lend(address _recipient, address _underlying, uint256 _amount) internal {
        __approveAssetMaxAsNeeded({
            _asset: _underlying,
            _target: address(AAVE_V2_LENDING_POOL_CONTRACT),
            _neededAmount: _amount
        });

        AAVE_V2_LENDING_POOL_CONTRACT.deposit({
            _underlying: _underlying,
            _amount: _amount,
            _to: _recipient,
            _referralCode: AAVE_V2_REFERRAL_CODE
        });
    }

    /// @dev Helper to execute redeeming on Aave v2
    function __aaveV2Redeem(address _recipient, address _underlying, uint256 _amount) internal {
        AAVE_V2_LENDING_POOL_CONTRACT.withdraw({_underlying: _underlying, _amount: _amount, _to: _recipient});
    }
}
