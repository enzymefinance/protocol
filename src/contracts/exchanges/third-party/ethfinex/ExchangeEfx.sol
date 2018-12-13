pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;

import "Exchange.sol";

contract ExchangeEfx is Exchange {
    mapping (address => address) public wrapper2TokenLookup;
    mapping (address => address) public token2WrapperLookup;
    event AddNewPair(address token, address wrapper);
    
    function addNewWrapperPair(address[] originalTokens, address[] wrapperTokens) public onlyOwner {
        for (uint i = 0; i < originalTokens.length; i++) {
            require(wrapper2TokenLookup[originalTokens[i]] == address(0));
            wrapper2TokenLookup[originalTokens[i]] = wrapperTokens[i];
            token2WrapperLookup[wrapperTokens[i]] = originalTokens[i];
            emit AddNewPair(originalTokens[i],wrapperTokens[i]);
        }
    }
}