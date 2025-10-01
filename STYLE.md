# Style Guide

The purpose of this style guide is to increase consistency within and between our contracts.
This makes them more legible, thereby helping maintain a high level of security.

## How to Use This Guide

Style preferences evolve. Some files contain previously-preferred conventions.

When creating a new file, always follow this style guide.

When editing a file - or if there is no explicitly mentioned rule - _Follow the style of existing code first_.

## Solidity

Please adhere to the recommended [official Solidity style guide for v0.8.19](https://solidity.readthedocs.io/en/v0.8.19/style-guide.html), in addition to the following styling choices:

### Imports

- Use named imports, e.g., `import {Foo} from src/Foo.sol`
- Order by file path

### State Variables

- All state vars and all functions should be `private` by default, unless they are meant to be inherited (in which case they are `internal`)
- Use `constant` vars for static universal values, e.g., one hundred percent, floating-point precision, etc
- Use `immutable` vars for static deployment-specific values, e.g., addresses and settings
- `constant` vars should have `private` visibility
- `immutable` vars should have `public` visibility (helpful for contract verification, inheritance, etc)
- storage vars should have `private` visibility
- Storage getter functions should be named as `getXXX`, `isXXX`, etc
- Storage setter functions should be named as `setXXX`, `addXXX`, `removeXXX`, etc
- All storage vars that should be easily verifiable (most vars) should have a simple getter
- For vars that refer to contracts, namespace as `address fooAddress` and `IFoo foo`

### Errors

- Use custom errors
- Namespace as `error MyContract__MyFunction__MyShortDescription()`. Omit `__MyFunction` if not belonging to a function.
- Order alphabetically

### Events

- Namespace as `event MyEvent(address myParam)`
- Order alphabetically

### Functions and modifiers

- Function, modifier, and event _parameters_ are _prefixed_ with an underscore, e.g., `_myParameter`
- Function, modifier, and event _return values_ are _suffixed_ with an underscore, e.g., `myReturnValue_`
- Always use named return values, but also always explicitly use `return`, i.e., `return (myValue1_, myValue2_)`. It is redundant, but it is performant and easier to review explicit return values.
- Non-externally visible _functions_ (`internal` and `private` visibility) are _prefixed_ with a double underscore, e.g., `__myInternalFunction()`
- Functions that perform and return calculations should be named as `calcXXX`
- Functions that verify conditions and return a boolean should be named as `isXXX` or `areXXX`
- Use named params (object notation) in all function calls, e.g., `foo({_bar: value})`
- May use comment block-delineated sections to group functionality
- Order by visibility (as per solidity style guide), then alphabetically

### Interfaces

- An `interface` for a contract should be prefixed with an `I`, e.g., `IMyContract`

#### External Interfaces

- Only include the minimal functions that are required by this repo's contracts. They are not complete representations of the contract interface.
- Exclude top-of-file Natspec
- Exclude comments, except where explanation is required

#### Internal Interfaces

- Child contract must always inherit its interface (if created), i.e., `MyContract is IMyContract`
- Child contract must explicitly `override` the interface functions

### Natspec Comments

- Use [Natspec](https://github.com/ethereum/wiki/wiki/Ethereum-Natural-Specification-Format) annotations, which can be parsed to generate documentation.
- Use thorough Natspec annotations for all externally-visible functions (i.e., `external` and `public`), and generally only a simple `@dev` annotation for internally-visible functions (i.e., `internal` and `private`) where helpful.
- Use `///` for multi-line comments rather than `/* */`.
- Do not include `@notice` or `@dev` multiple times in the same block.

Annotations should be in this order:

```solidity
/// @notice Send tokens to another address, and get back the balances before/after balances
/// @param _toAddress The address to receive funds
/// @return oldBalance_ The balance before sending funds
/// @return newBalance_ The balance after sending funds
/// @dev Some comment intended for developers
function sendFunds(address _toAddress) external
    returns (uint256 oldBalance_, uint256 newBalance_)
{
    oldBalance_ = balance;
    ...
    newBalance_ = __calcNewBalance(oldBalance_);
}

/// @dev Helper to calculate the new balance after sending funds
function __calcNewBalance(uint256 _oldBalance) private
    returns (uint256 newBalance_)
{
    ...
}
```

### Misc

- Max line length: 120
- Data types should be explicitly defined, e.g., `uint256` instead of `uint`

### Tests

See the [tests README](/tests/README.md) for further conventions used in test suites.

## Tools

Some of our style choices are enforceable by a linter and formatting rules.

Using a linter is not a substitute for understanding the style guide, however, since most of our style choices do not have rules that can be enforced by these linters yet.

### Linting

We use [foundry](https://github.com/foundry-rs/foundry) for linting via `forge lint`.

### Formatting

We use [foundry](https://github.com/foundry-rs/foundry) for formatting via `forge fmt`.
