// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../release/core/fund/comptroller/ComptrollerLib.sol";
import "./MockToken.sol";

/// @title MockReentrancyToken Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A mock ERC20 token implementation that is able to re-entrance redeemShares and buyShares functions
contract MockReentrancyToken is MockToken("Mock Reentrancy Token", "MRT", 18) {
    bool public bad;
    address public comptrollerProxy;

    function makeItReentracyToken(address _comptrollerProxy) external {
        bad = true;
        comptrollerProxy = _comptrollerProxy;
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        if (bad) {
            ComptrollerLib(comptrollerProxy).redeemShares();
        } else {
            _transfer(_msgSender(), recipient, amount);
        }
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public override returns (bool) {
        if (bad) {
            ComptrollerLib(comptrollerProxy).buyShares(
                new address[](0),
                new uint256[](0),
                new uint256[](0)
            );
        } else {
            _transfer(sender, recipient, amount);
        }
        return true;
    }
}
