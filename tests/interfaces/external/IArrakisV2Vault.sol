// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IArrakisV2Vault Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IArrakisV2Vault {
    function burn(uint256 _burnAmount, address _receiver) external returns (uint256 amount0_, uint256 amount1_);

    function getPools() external view returns (address[] memory pools_);

    function managerFeeBPS() external view returns (uint16 managerFeeBPS_);

    function owner() external view returns (address ownerAddress_);

    function setManagerFeeBPS(uint16 _managerFeeBPS) external;

    function setRestrictedMint(address _minter) external;

    function token0() external view returns (address token0_);

    function token1() external view returns (address token1_);
}
