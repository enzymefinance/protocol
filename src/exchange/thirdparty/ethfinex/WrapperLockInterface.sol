pragma solidity ^0.4.21;
/*

  Copyright Ethfinex Inc 2018

  Licensed under the Apache License, Version 2.0
  http://www.apache.org/licenses/LICENSE-2.0

*/

contract WrapperLockInterface {
    function deposit(uint _value, uint _forTime) public returns (bool success);
    function withdraw(uint _value, uint8 v, bytes32 r, bytes32 s, uint signatureValidUntilBlock) public;
}