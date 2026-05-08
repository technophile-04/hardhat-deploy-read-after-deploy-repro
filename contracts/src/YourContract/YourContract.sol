// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal contract used to reproduce a deploy + immediate read race.
contract YourContract {
    string public greeting;

    constructor(string memory _greeting) {
        greeting = _greeting;
    }
}
