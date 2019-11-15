pragma solidity ^0.4.21;

import "../0x/Ownable.sol";

contract WrapperRegistryEFX is Ownable{
    
    mapping (address => address) public wrapper2TokenLookup;
    mapping (address => address) public token2WrapperLookup;
    event AddNewPair(address token, address wrapper);
    
    function addNewWrapperPair(address[] memory originalTokens, address[] memory wrapperTokens) public onlyOwner {
        for (uint i = 0; i < originalTokens.length; i++) {
            require(token2WrapperLookup[originalTokens[i]] == address(0));
            wrapper2TokenLookup[wrapperTokens[i]] = originalTokens[i];
            token2WrapperLookup[originalTokens[i]] = wrapperTokens[i];
            emit AddNewPair(originalTokens[i],wrapperTokens[i]);
        }
    }
}