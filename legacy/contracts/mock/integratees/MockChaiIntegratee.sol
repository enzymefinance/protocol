// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../MockToken.sol";

// TODO: Consider adding ability to set DAI/CHAI rate.
contract MockChaiIntegratee is MockToken("Chai", "CHAI", 18) {
    address public immutable DAI;

    constructor(address _dai) public {
        DAI = _dai;
    }

    function join(address payable _trader, uint256 _daiAmount) external {
        // Mint CHAI for the trader.
        _mint(_trader, _daiAmount);
        // Take custody of the trader's DAI.
        ERC20(DAI).transferFrom(msg.sender, address(this), _daiAmount);
    }

    function exit(address payable _trader, uint256 _chaiAmount) external {
        // Burn CHAI of the trader.
        _burn(_trader, _chaiAmount);
        // Release DAI to the trader.
        ERC20(DAI).transfer(msg.sender, _chaiAmount);
    }
}
