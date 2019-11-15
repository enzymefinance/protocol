pragma solidity ^0.4.25;

import "./auth.sol";

contract PermissiveAuthority is DSAuthority {
    function canCall(address src, address dst, bytes4 sig)
        public
        view
        returns (bool)
    {
        return true;
    }
}
