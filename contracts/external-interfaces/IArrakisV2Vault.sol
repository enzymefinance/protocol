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
    struct Range {
        int24 lowerTick;
        int24 upperTick;
        uint24 feeTier;
    }

    function burn(uint256 _burnAmount, address _receiver) external returns (uint256 amount0_, uint256 amount1_);

    function getRanges() external view returns (Range[] memory);

    function managerBalance0() external view returns (uint256 managerBalance0_);

    function managerBalance1() external view returns (uint256 managerBalance1_);

    function managerFeeBPS() external view returns (uint16 managerFeeBPS_);

    function mint(uint256 _mintAmount, address _receiver) external returns (uint256 amount0_, uint256 amount1_);

    function token0() external view returns (address token0_);

    function token1() external view returns (address token1_);

    function totalSupply() external view returns (uint256 totalSupply_);
}
