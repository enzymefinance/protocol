/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

/// @title IMorphoBlueFlashLoanCallback Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IMorphoBlueFlashLoanCallback {
    function onMorphoFlashLoan(uint256 _assets, bytes calldata _data) external;
}
