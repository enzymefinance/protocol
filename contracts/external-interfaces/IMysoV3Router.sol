// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IMysoV3DataTypes} from "./IMysoV3DataTypes.sol";

/// @title IMysoV3Router Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IMysoV3Router {
    function createAuction(
        address _escrowOwner,
        IMysoV3DataTypes.AuctionInitialization calldata _auctionInitialization,
        address _distPartner
    ) external;

    function getEscrows(uint256 _from, uint256 _numElements) external view returns (address[] memory escrows_);

    function numEscrows() external view returns (uint256 numEscrows_);

    function takeQuote(
        address _escrowOwner,
        IMysoV3DataTypes.RFQInitialization calldata _rfqInitialization,
        address _distPartner
    ) external;

    function withdraw(address _escrow, address _to, address _token, uint256 _amount) external;
}
