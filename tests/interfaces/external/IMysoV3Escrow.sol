// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IMysoV3DataTypes} from "./IMysoV3DataTypes.sol";
import {IMysoV3Escrow as IMysoV3EscrowProd} from "contracts/external-interfaces/IMysoV3Escrow.sol";

/// @title IMysoV3Escrow Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IMysoV3Escrow is IMysoV3EscrowProd {
    function owner() external view returns (address owner_);

    function previewBid(uint256 _relBid, uint256 _refSpot, bytes[] memory _oracleData)
        external
        view
        returns (IMysoV3DataTypes.BidPreview memory preview_, address distPartner_);
}
