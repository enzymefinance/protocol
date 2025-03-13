// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IMysoV3DataTypes} from "./IMysoV3DataTypes.sol";
import {IMysoV3Router as IMysoV3RouterProd} from "contracts/external-interfaces/IMysoV3Router.sol";

/// @title IMysoV3Router Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IMysoV3Router is IMysoV3RouterProd {
    function bidOnAuction(
        address _escrow,
        address _optionReceiver,
        uint256 _relBid,
        uint256 _refSpot,
        bytes[] memory _oracleData
    ) external returns (IMysoV3DataTypes.BidPreview memory preview_, address distPartner_);

    function borrow(address _escrow, address _underlyingReceiver, uint128 _borrowUnderlyingAmount) external;

    function exercise(
        address _escrow,
        address _underlyingReceiver,
        uint256 _underlyingAmount,
        bool _payInSettlementToken,
        bytes[] memory _oracleData
    ) external;
}
