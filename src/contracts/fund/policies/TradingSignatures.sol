pragma solidity 0.5.15;

contract TradingSignatures {
    bytes4 constant public MAKE_ORDER = 0x79705be7; // makeOrderSignature
    bytes4 constant public TAKE_ORDER = 0xe51be6e8; // takeOrderSignature
}
