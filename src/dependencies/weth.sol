pragma solidity ^0.4.18;

import "./erc20.sol";

contract WETHEvents is ERC20Events {
    event Join(address indexed dst, uint wad);
    event Exit(address indexed src, uint wad);
}

contract WETH is ERC20, WETHEvents {
    function join() public payable;
    function exit(uint wad) public;
}
