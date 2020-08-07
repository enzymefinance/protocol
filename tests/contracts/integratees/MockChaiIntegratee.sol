// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../PreminedToken.sol";

// TODO: Add ability to set DAI/CHAI rate.
contract MockChaiIntegratee is PreminedToken("Chai", "CHAI", 18) {
    address public immutable DAI;

    constructor(address _dai) public {
        DAI = _dai;
    }

    function join(address payable _trader, uint256 _daiAmount) external {
        // Take custory of the trader's DAI.
        ERC20(DAI).transferFrom(_trader, address(this), _daiAmount);
        // Mint CHAI for the trader.
        _mint(_trader, _daiAmount);
    }

    function exit(address payable _trader, uint256 _chaiAmount) external {
        // Release DAI to the trader.
        ERC20(DAI).transfer(_trader, _chaiAmount);
        // Burn CHAI of the trader.
        _burn(_trader, _chaiAmount);
    }
}
