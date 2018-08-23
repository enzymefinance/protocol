pragma solidity ^0.4.21;

import "../dependencies/ERC20.sol";
import "./Shares.i.sol";


contract Shares is SharesInterface, ERC20 {

    function createFor(address who, uint amount) onlyControllers {
        totalSupply = add(totalSupply, amount);
        balances[who] = add(balances[who], amount);
    }

    function destroyFor(address who, uint amount) onlyControllers {
        require(sub(balances[who], amount) >= 0);
        totalSupply = sub(totalSupply, amount);
        balances[who] = sub(balances[who], amount);
    }
}

