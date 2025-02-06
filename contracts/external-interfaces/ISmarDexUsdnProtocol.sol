// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title ISmarDexUsdnProtocol Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface ISmarDexUsdnProtocol {
    enum ProtocolAction {
        None,
        Initialize,
        InitiateDeposit,
        ValidateDeposit,
        InitiateWithdrawal,
        ValidateWithdrawal,
        InitiateOpenPosition,
        ValidateOpenPosition,
        InitiateClosePosition,
        ValidateClosePosition,
        Liquidation
    }

    function getOracleMiddleware() external view returns (address oracleMiddleware_);

    function usdnPrice(uint128 _currentPrice) external view returns (uint256 price_);
}
