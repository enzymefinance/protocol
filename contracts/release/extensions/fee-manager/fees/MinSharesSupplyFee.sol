// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import "./utils/FeeBase.sol";

/// @title MinSharesSupplyFee Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Charges and permanently locks a one-time fee to ensure a minimum shares supply at all times
contract MinSharesSupplyFee is FeeBase {
    event Settled(address indexed comptrollerProxy, address indexed payer, uint256 sharesQuantity);

    uint256 private constant MIN_SHARES_SUPPLY = 1e6;
    // Shares token does not allow transfers to address(0)
    address private constant LOCKED_SHARES_ADDRESS = address(1);

    constructor(address _feeManager) public FeeBase(_feeManager) {}

    // EXTERNAL FUNCTIONS

    /// @notice Add the initial fee settings for a fund
    /// @dev Unnecessary for this fee
    function addFundSettings(address, bytes calldata) external virtual override {}

    /// @notice Gets the recipient of the fee for a given fund
    /// @return recipient_ The recipient
    function getRecipientForFund(address)
        external
        view
        virtual
        override
        returns (address recipient_)
    {
        return LOCKED_SHARES_ADDRESS;
    }

    /// @notice Settles the fee
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _settlementData Encoded args to use in calculating the settlement
    /// @return settlementType_ The type of settlement
    /// @return payer_ The payer of shares due
    /// @return sharesDue_ The amount of shares due
    function settle(
        address _comptrollerProxy,
        address _vaultProxy,
        IFeeManager.FeeHook,
        bytes calldata _settlementData,
        uint256
    )
        external
        override
        onlyFeeManager
        returns (
            IFeeManager.SettlementType settlementType_,
            address payer_,
            uint256 sharesDue_
        )
    {
        uint256 lockedShares = ERC20(_vaultProxy).balanceOf(LOCKED_SHARES_ADDRESS);
        if (lockedShares >= MIN_SHARES_SUPPLY) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }

        // lockedShares < MIN_SHARES_SUPPLY
        sharesDue_ = MIN_SHARES_SUPPLY - lockedShares;
        (payer_, , ) = __decodePostBuySharesSettlementData(_settlementData);

        emit Settled(_comptrollerProxy, payer_, sharesDue_);

        return (IFeeManager.SettlementType.Direct, payer_, sharesDue_);
    }

    /// @notice Gets whether the fee settles and requires GAV on a particular hook
    /// @param _hook The FeeHook
    /// @return settles_ True if the fee settles on the _hook
    /// @return usesGav_ True if the fee uses GAV during settle() for the _hook
    function settlesOnHook(IFeeManager.FeeHook _hook)
        external
        view
        override
        returns (bool settles_, bool usesGav_)
    {
        if (_hook == IFeeManager.FeeHook.PostBuyShares) {
            return (true, false);
        }

        return (false, false);
    }
}
