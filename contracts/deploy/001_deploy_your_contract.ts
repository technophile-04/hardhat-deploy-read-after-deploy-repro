import {deployScript, artifacts} from '../rocketh/deploy.js';

/**
 * REPRO: read-after-write race when reading from a freshly deployed contract.
 *
 * Pattern:
 *   1. env.deploy(...) broadcasts the deploy tx and returns once a receipt is
 *      observed on the load-balanced public RPC.
 *   2. The script immediately calls env.read(...) which issues `eth_call` with
 *      `blockTag: "latest"`.
 *   3. The eth_call routes through the same LB to a different replica that
 *      hasn't yet replicated the block containing the new contract.
 *   4. That replica returns `0x` (no bytecode at the address from its view).
 *   5. viem's decodeFunctionResult throws `AbiDecodingZeroDataError`.
 *
 * Trigger reliably with `--reset` against a Sepolia-class testnet.
 * Local hardhat node does not reproduce — single replica, no race.
 */
export default deployScript(
	async (env) => {
		const {deployer} = env.namedAccounts;

		const yourContract = await env.deploy('YourContract', {
			account: deployer,
			artifact: artifacts.YourContract,
			args: ['Building Unstoppable Apps!!!'],
		});

		// No wait between deploy and read — this is what triggers the race
		// on load-balanced RPC providers (Alchemy, Infura, public testnet RPCs).
		const greeting = await env.read(yourContract, {functionName: 'greeting'});
		console.log('👋 Initial greeting:', greeting);
	},
	{tags: ['YourContract', 'YourContract_deploy']},
);
