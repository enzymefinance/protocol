pragma solidity 0.5.15;

import "./DSAuth.sol";

contract PermissiveAuthority is DSAuthority {
    function canCall(address src, address dst, bytes4 sig)
        public
        view
        returns (bool)
    {
        return true;
    }
}
