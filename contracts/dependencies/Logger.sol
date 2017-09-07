pragma solidity ^0.4.11;

import './DBC.sol';
import './Permissioned.sol';

contract Logger is DBC, Permissioned {
    // Error logs
    event Error(address thrower, uint errCode, string errMsg);
    function logError (address thrower, uint errCode, string errMsg)
        pre_cond(isPermitted(msg.sender))
    {
        Error(thrower, errCode, errMsg);
    }
}
