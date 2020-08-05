// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./utils/MockIntegrateeBase.sol";

contract MockKyberIntegratee is MockIntegrateeBase {
    constructor(address[] memory _defaultRateAssets)
        public
        MockIntegrateeBase(_defaultRateAssets, new address[](0), new uint8[](0), 18) {}

    function swapEtherToToken(address _destToken, uint256)
        external
        payable
        returns (uint256)
    {
        return __getRateAndSwapAssets(
            msg.sender,
            ETH_ADDRESS,
            msg.value,
            _destToken
        );
    }

    function swapTokenToEther(address _srcToken, uint256 _srcAmount, uint256)
        external
        returns (uint256)
    {
        return __getRateAndSwapAssets(
            msg.sender,
            _srcToken,
            _srcAmount,
            ETH_ADDRESS
        );
    }

    function swapTokenToToken(
        address _srcToken,
        uint256 _srcAmount,
        address _destToken,
        uint256
    )
        external
        returns (uint256)
    {
        return __getRateAndSwapAssets(
            msg.sender,
            _srcToken,
            _srcAmount,
            _destToken
        );
    }
}
