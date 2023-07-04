// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

interface ICurveLiquidityPool {
    function coins(int128) external view returns (address);

    function coins(uint256) external view returns (address);

    function get_virtual_price() external view returns (uint256);

    function underlying_coins(int128) external view returns (address);

    function underlying_coins(uint256) external view returns (address);
}
