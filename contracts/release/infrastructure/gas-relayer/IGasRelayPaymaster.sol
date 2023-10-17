// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;
pragma experimental ABIEncoderV2;

import {IGsnPaymaster} from "../../../external-interfaces/IGsnPaymaster.sol";

/// @title IGasRelayPaymaster Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IGasRelayPaymaster is IGsnPaymaster {
    function deposit() external;

    function getLastDepositTimestamp() external view returns (uint256 lastDepositTimestamp_);

    function getParentComptroller() external view returns (address parentComptroller_);

    function getParentVault() external view returns (address parentVault_);

    function getWethToken() external view returns (address wethToken_);

    function init(address _vault) external;

    function withdrawBalance() external;
}
