// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IStaderUserWithdrawalManager as IStaderUserWithdrawalManagerProd} from
    "contracts/external-interfaces/IStaderUserWithdrawalManager.sol";

/// @title IStaderUserWithdrawalManager Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IStaderUserWithdrawalManager is IStaderUserWithdrawalManagerProd {
    function finalizeUserWithdrawalRequest() external;

    function nextRequestId() external view returns (uint256 requestId_);

    function nextRequestIdToFinalize() external view returns (uint256 requestId_);

    function staderConfig() external view returns (address staderConfig_);
}
