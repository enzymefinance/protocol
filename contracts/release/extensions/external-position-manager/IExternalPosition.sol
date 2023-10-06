// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IExternalPositionLibCore} from "../../../persistent/external-positions/IExternalPositionLibCore.sol";

/// @title IExternalPosition Contract
/// @author Enzyme Council <security@enzyme.finance>
interface IExternalPosition is IExternalPositionLibCore {
    function getDebtAssets() external returns (address[] memory assets_, uint256[] memory amounts_);

    function getManagedAssets() external returns (address[] memory assets_, uint256[] memory amounts_);

    function init(bytes memory _data) external;
}
