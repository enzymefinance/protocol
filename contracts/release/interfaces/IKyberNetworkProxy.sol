// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title Kyber Network interface
interface IKyberNetworkProxy {
    function swapEtherToToken(address, uint256) external payable returns (uint256);

    function swapTokenToEther(
        address,
        uint256,
        uint256
    ) external returns (uint256);

    function swapTokenToToken(
        address,
        uint256,
        address,
        uint256
    ) external returns (uint256);
}
