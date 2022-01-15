// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../dispatcher/IDispatcher.sol";
import "./bases/ProtocolFeeReserveLibBase1.sol";
import "./interfaces/IProtocolFeeReserve1.sol";

/// @title ProtocolFeeReserveLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The proxiable library contract for ProtocolFeeReserveProxy
contract ProtocolFeeReserveLib is IProtocolFeeReserve1, ProtocolFeeReserveLibBase1 {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    // Equates to a 50% discount
    uint256 private constant BUYBACK_DISCOUNT_DIVISOR = 2;

    IDispatcher private immutable DISPATCHER_CONTRACT;
    ERC20 private immutable MLN_TOKEN_CONTRACT;

    constructor(address _dispatcher, address _mlnToken) public {
        DISPATCHER_CONTRACT = IDispatcher(_dispatcher);
        MLN_TOKEN_CONTRACT = ERC20(_mlnToken);
    }

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

    /// @notice Withdraws the full MLN token balance to the given address
    /// @param _to The address to which to send the MLN token balance
    /// @dev Used in the case that MLN tokens are sent to this contract rather than being burned,
    /// which will be the case on networks where MLN does not implement a burn function in the desired manner.
    /// The Enzyme Council will periodically withdraw the MLN, bridge to Ethereum mainnet, and burn.
    function withdrawMlnTokenBalanceTo(address _to) external {
        require(
            msg.sender == DISPATCHER_CONTRACT.getOwner(),
            "withdrawMlnTokenBalance: Unauthorized"
        );

        uint256 balance = MLN_TOKEN_CONTRACT.balanceOf(address(this));
        MLN_TOKEN_CONTRACT.safeTransfer(_to, balance);

        emit MlnTokenBalanceWithdrawn(_to, balance);
    }
}
