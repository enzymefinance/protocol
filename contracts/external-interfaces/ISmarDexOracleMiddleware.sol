// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {ISmarDexUsdnProtocol} from "./ISmarDexUsdnProtocol.sol";

/// @title ISmarDexOracleMiddleware Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface ISmarDexOracleMiddleware {
    struct PriceInfo {
        uint256 price;
        uint256 neutralPrice;
        uint256 timestamp;
    }

    /// @dev non-view function, but we can type it as view for the interface
    function parseAndValidatePrice(
        bytes32 _actionId,
        uint128 _targetTimestamp,
        ISmarDexUsdnProtocol.ProtocolAction _action,
        bytes calldata _data
    ) external view returns (PriceInfo memory priceInfo_);
}
