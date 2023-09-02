// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";

import {IUniswapV3SwapRouter} from "tests/interfaces/external/IUniswapV3SwapRouter.sol";

address constant ETHEREUM_SWAP_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
address constant POLYGON_SWAP_ROUTER = ETHEREUM_SWAP_ROUTER;

abstract contract UniswapV3Utils is AddOnUtilsBase {
    function formatUniswapV3ExactInputData(
        address _recipient,
        address[] memory _pathAddresses,
        uint24[] memory _pathFees,
        uint256 _outgoingAssetAmount,
        uint256 _minIncomingAssetAmount
    ) internal view returns (bytes memory exactInputData_) {
        require(_pathAddresses.length > 1, "formatUniswapV3ExactInputSwapData: Not enough _pathAddresses");
        require(
            _pathFees.length == _pathAddresses.length - 1,
            "formatUniswapV3ExactInputSwapData: Incorrect _pathFees count"
        );

        bytes memory encodedPath;
        for (uint256 i; i < _pathAddresses.length; i++) {
            if (i != _pathAddresses.length - 1) {
                encodedPath = abi.encodePacked(encodedPath, _pathAddresses[i], _pathFees[i]);
            } else {
                encodedPath = abi.encodePacked(encodedPath, _pathAddresses[i]);
            }
        }

        IUniswapV3SwapRouter.ExactInputParams memory exactInputParams = IUniswapV3SwapRouter.ExactInputParams({
            path: encodedPath,
            recipient: _recipient,
            deadline: block.timestamp + 1,
            amountIn: _outgoingAssetAmount,
            amountOutMinimum: _minIncomingAssetAmount
        });

        return abi.encodeWithSelector(IUniswapV3SwapRouter.exactInput.selector, exactInputParams);
    }
}
