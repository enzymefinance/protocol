// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IAaveV3FlashLoanAssetManager Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IAaveV3FlashLoanAssetManager {
    struct Call {
        address target;
        bytes data;
    }

    function flashLoan(address[] calldata _assets, uint256[] calldata _amounts, bytes calldata _encodedCalls) external;

    function init(address _owner, address _vaultProxyAddress) external;
}
