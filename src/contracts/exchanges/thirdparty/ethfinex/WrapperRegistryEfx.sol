pragma solidity ^0.4.21;

contract OwnableClone {
  address private _owner;

  event OwnershipTransferred(
    address indexed previousOwner,
    address indexed newOwner
  );

  /**
   * @dev The Ownable constructor sets the original `owner` of the contract to the sender
   * account.
   */
  constructor() internal {
    _owner = msg.sender;
    emit OwnershipTransferred(address(0), _owner);
  }

  /**
   * @return the address of the owner.
   */
  function owner() public view returns(address) {
    return _owner;
  }

  /**
   * @dev Throws if called by any account other than the owner.
   */
  modifier onlyOwner() {
    require(isOwner());
    _;
  }
  
  /**
   * @return true if `msg.sender` is the owner of the contract.
   */
  function isOwner() public view returns(bool) {
    return msg.sender == _owner;
  }
}

contract WrapperRegistryEFX is OwnableClone {
    
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