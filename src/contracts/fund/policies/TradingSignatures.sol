pragma solidity ^0.4.25;

contract TradingSignatures {
    bytes4 constant public MAKE_ORDER = 0x3b14cd7e; // makeOrderSignature
    bytes4 constant public TAKE_ORDER = 0xd2e65751; // takeOrderSignature
}
