// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
import "./ITestStandardToken.sol";

/// @title ITestCompoundV3Comet Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestCompoundV3Comet is ITestStandardToken {
    function baseToken() external view returns (address baseToken_);

    function supply(address _asset, uint256 _amount) external;

    function withdraw(address _asset, uint256 _amount) external;
}
