// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../interfaces/IAaveV3Pool.sol";
import "../../../../../utils/AssetHelpers.sol";

/// @title AaveV3ActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the Aave v3 lending functions
abstract contract AaveV3ActionsMixin is AssetHelpers {
    IAaveV3Pool internal immutable AAVE_V3_POOL_CONTRACT;
    uint16 internal immutable AAVE_V3_REFERRAL_CODE;

    constructor(address _pool, uint16 _referralCode) public {
        AAVE_V3_POOL_CONTRACT = IAaveV3Pool(_pool);
        AAVE_V3_REFERRAL_CODE = _referralCode;
    }

    /// @dev Helper to execute lending on Aave v3
    function __aaveV3Lend(
        address _recipient,
        address _underlying,
        uint256 _amount
    ) internal {
        __approveAssetMaxAsNeeded({
            _asset: _underlying,
            _target: address(AAVE_V3_POOL_CONTRACT),
            _neededAmount: _amount
        });

        AAVE_V3_POOL_CONTRACT.supply({
            _underlying: _underlying,
            _amount: _amount,
            _to: _recipient,
            _referralCode: AAVE_V3_REFERRAL_CODE
        });
    }

    /// @dev Helper to execute redeeming aTokens on Aave v3
    function __aaveV3Redeem(
        address _recipient,
        address _underlying,
        uint256 _amount
    ) internal {
        AAVE_V3_POOL_CONTRACT.withdraw({
            _underlying: _underlying,
            _amount: _amount,
            _to: _recipient
        });
    }
}
