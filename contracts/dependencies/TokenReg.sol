pragma solidity ^0.4.0;

/// @title Token Registry contract.
/// @author Gav Wood (Ethcore), 2016.
/// @notice Released under the Apache Licence 2.
/// @notice Taken from https://github.com/paritytech/contracts/blob/master/TokenReg.sol
contract Owned {
	modifier only_owner { if (msg.sender != owner) return; _; }

	event NewOwner(address indexed old, address indexed current);

	function setOwner(address _new) only_owner { NewOwner(owner, _new); owner = _new; }

	address public owner = msg.sender;
}

contract TokenReg is Owned {
	struct Token {
		address addr;
		string tla;
		uint base;
		string name;
		address owner;
		mapping (bytes32 => bytes32) meta;
	}

	modifier when_fee_paid { if (msg.value < fee) return; _; }
	modifier when_address_free(address _addr) { if (mapFromAddress[_addr] != 0) return; _; }
	modifier when_tla_free(string _tla) { if (mapFromTLA[_tla] != 0) return; _; }
	modifier when_is_tla(string _tla) { if (bytes(_tla).length != 3) return; _; }
	modifier when_has_tla(string _tla) { if (mapFromTLA[_tla] == 0) return; _; }
	modifier only_token_owner(uint _id) { if (tokens[_id].owner != msg.sender) return; _; }

	event Registered(string indexed tla, uint indexed id, address addr, string name);
	event Unregistered(string indexed tla, uint indexed id);
	event MetaChanged(uint indexed id, bytes32 indexed key, bytes32 value);

	function register(address _addr, string _tla, uint _base, string _name) payable returns (bool) {
		return registerAs(_addr, _tla, _base, _name, msg.sender);
	}

	function registerAs(address _addr, string _tla, uint _base, string _name, address _owner) payable when_fee_paid when_address_free(_addr) when_is_tla(_tla) when_tla_free(_tla) returns (bool) {
		tokens.push(Token(_addr, _tla, _base, _name, _owner));
		mapFromAddress[_addr] = tokens.length;
		mapFromTLA[_tla] = tokens.length;
		Registered(_tla, tokens.length - 1, _addr, _name);
		return true;
	}

	function unregister(uint _id) only_owner {
		Unregistered(tokens[_id].tla, _id);
		delete mapFromAddress[tokens[_id].addr];
		delete mapFromTLA[tokens[_id].tla];
		delete tokens[_id];
	}

	function setFee(uint _fee) only_owner {
		fee = _fee;
	}

	function tokenCount() constant returns (uint) { return tokens.length; }
	function token(uint _id) constant returns (address addr, string tla, uint base, string name, address owner) {
		var t = tokens[_id];
		addr = t.addr;
		tla = t.tla;
		base = t.base;
		name = t.name;
		owner = t.owner;
	}

	function fromAddress(address _addr) constant returns (uint id, string tla, uint base, string name, address owner) {
		id = mapFromAddress[_addr] - 1;
		var t = tokens[id];
		tla = t.tla;
		base = t.base;
		name = t.name;
		owner = t.owner;
	}

	function fromTLA(string _tla) constant returns (uint id, address addr, uint base, string name, address owner) {
		id = mapFromTLA[_tla] - 1;
		var t = tokens[id];
		addr = t.addr;
		base = t.base;
		name = t.name;
		owner = t.owner;
	}

	function meta(uint _id, bytes32 _key) constant returns (bytes32) {
		return tokens[_id].meta[_key];
	}

	function setMeta(uint _id, bytes32 _key, bytes32 _value) only_token_owner(_id) {
		tokens[_id].meta[_key] = _value;
		MetaChanged(_id, _key, _value);
	}

	function drain() only_owner {
		if (!msg.sender.send(this.balance))
			throw;
	}

	mapping (address => uint) mapFromAddress;
	mapping (string => uint) mapFromTLA;
	Token[] tokens;
	uint public fee = 1 ether;
}
