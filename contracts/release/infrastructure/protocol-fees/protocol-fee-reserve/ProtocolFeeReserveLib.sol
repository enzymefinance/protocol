// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./bases/ProtocolFeeReserveLibBase1.sol";
import "./interfaces/IProtocolFeeReserve1.sol";

/// @title ProtocolFeeReserveLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The proxiable library contract for ProtocolFeeReserveProxy
contract ProtocolFeeReserveLib is IProtocolFeeReserve1, ProtocolFeeReserveLibBase1 {
    using SafeMath for uint256;

    // Equates to a 50% discount
    uint256 private constant BUYBACK_DISCOUNT_DIVISOR = 2;

    /// @notice Indicates that the calling VaultProxy is buying back shares collected as protocol fee,
    /// and returns the amount of MLN that should be burned for the buyback
    /// @param _sharesAmount The amount of shares to buy back
    /// @param _mlnValue The MLN-denominated market value of _sharesAmount
    /// @return mlnAmountToBurn_ The amount of MLN to burn
    /// @dev Since VaultProxy instances are completely trusted, all the work of calculating and
    /// burning the appropriate amount of shares and MLN can be done by the calling VaultProxy.
    /// This contract only needs to provide the discounted MLN amount to burn.
    /// Though it is currently unused, passing in GAV would allow creating a tiered system of
    /// discounts in a new library, for example.
    function buyBackSharesViaTrustedVaultProxy(
        uint256 _sharesAmount,
        uint256 _mlnValue,
        uint256
    ) external override returns (uint256 mlnAmountToBurn_) {
        mlnAmountToBurn_ = _mlnValue.div(BUYBACK_DISCOUNT_DIVISOR);

        if (mlnAmountToBurn_ == 0) {
            return 0;
        }

        emit SharesBoughtBack(msg.sender, _sharesAmount, _mlnValue, mlnAmountToBurn_);

        return mlnAmountToBurn_;
    }
}
