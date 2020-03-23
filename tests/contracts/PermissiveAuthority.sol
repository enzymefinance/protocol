pragma solidity 0.6.4;

import "main/dependencies/DSAuth.sol";

contract PermissiveAuthority is DSAuthority {
    function canCall(address src, address dst, bytes4 sig)
        public
        view
        override
        returns (bool)
    {
        return true;
    }
}
