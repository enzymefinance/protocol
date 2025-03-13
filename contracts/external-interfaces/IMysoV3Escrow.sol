// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IMysoV3DataTypes} from "./IMysoV3DataTypes.sol";

/// @title IMysoV3Escrow Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IMysoV3Escrow {
    function totalBorrowed() external view returns (uint128 totalBorrowed_);

    function optionMinted() external view returns (bool isOptionMinted_);

    function optionInfo() external view returns (IMysoV3DataTypes.OptionInfo memory optionInfo_);

    function owner() external view returns (address owner_);
}
