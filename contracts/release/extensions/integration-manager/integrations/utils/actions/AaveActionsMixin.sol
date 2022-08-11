// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../interfaces/IAaveLendingPool.sol";
import "../../../../../interfaces/IAaveLendingPoolAddressProvider.sol";
import "../../../../../utils/AssetHelpers.sol";

/// @title AaveActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the Aave lending functions
abstract contract AaveActionsMixin is AssetHelpers {
    uint16 private constant AAVE_REFERRAL_CODE = 158;

    address private immutable AAVE_LENDING_POOL_ADDRESS_PROVIDER;

    constructor(address _lendingPoolAddressProvider) public {
        AAVE_LENDING_POOL_ADDRESS_PROVIDER = _lendingPoolAddressProvider;
    }

    /// @dev Helper to execute lending
    function __aaveLend(
        address _recipient,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount
    ) internal {
        address lendingPoolAddress = IAaveLendingPoolAddressProvider(
            AAVE_LENDING_POOL_ADDRESS_PROVIDER
        ).getLendingPool();

        __approveAssetMaxAsNeeded(_outgoingAsset, lendingPoolAddress, _outgoingAssetAmount);

        IAaveLendingPool(lendingPoolAddress).deposit(
            _outgoingAsset,
            _outgoingAssetAmount,
            _recipient,
            AAVE_REFERRAL_CODE
        );
    }

    /// @dev Helper to execute redeeming
    function __aaveRedeem(
        address _recipient,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        address _incomingAsset
    ) internal {
        address lendingPoolAddress = IAaveLendingPoolAddressProvider(
            AAVE_LENDING_POOL_ADDRESS_PROVIDER
        ).getLendingPool();

        __approveAssetMaxAsNeeded(_outgoingAsset, lendingPoolAddress, _outgoingAssetAmount);

        IAaveLendingPool(lendingPoolAddress).withdraw(
            _incomingAsset,
            _outgoingAssetAmount,
            _recipient
        );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `AAVE_LENDING_POOL_ADDRESS_PROVIDER` variable
    /// @return aaveLendingPoolAddressProvider_ The `AAVE_LENDING_POOL_ADDRESS_PROVIDER` variable value
    function getAaveLendingPoolAddressProvider()
        public
        view
        returns (address aaveLendingPoolAddressProvider_)
    {
        return AAVE_LENDING_POOL_ADDRESS_PROVIDER;
    }

    /// @notice Gets the `AAVE_REFERRAL_CODE` variable
    /// @return aaveReferralCode_ The `AAVE_REFERRAL_CODE` variable value
    function getAaveReferralCode() public pure returns (uint16 aaveReferralCode_) {
        return AAVE_REFERRAL_CODE;
    }
}
