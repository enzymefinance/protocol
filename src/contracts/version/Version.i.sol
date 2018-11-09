pragma solidity ^0.4.21;

interface VersionInterface {
    function getAmguPrice() returns (uint);
    function isFund(address) returns (bool);
    function isFundFactory(address) returns (bool);
}

