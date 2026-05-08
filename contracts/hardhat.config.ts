import 'dotenv/config';
import type {HardhatUserConfig} from 'hardhat/config';

import HardhatNodeTestRunner from '@nomicfoundation/hardhat-node-test-runner';
import HardhatViem from '@nomicfoundation/hardhat-viem';
import HardhatNetworkHelpers from '@nomicfoundation/hardhat-network-helpers';
import HardhatKeystore from '@nomicfoundation/hardhat-keystore';
import HardhatDeploy from 'hardhat-deploy';
import HardhatExternalArtifactsPlugin from 'hardhat-external-artifacts';

const config: HardhatUserConfig = {
	plugins: [
		HardhatNodeTestRunner,
		HardhatViem,
		HardhatNetworkHelpers,
		HardhatKeystore,
		HardhatDeploy,
		HardhatExternalArtifactsPlugin,
	],
	solidity: {
		profiles: {
			default: {version: '0.8.28'},
			production: {
				version: '0.8.28',
				settings: {optimizer: {enabled: true, runs: 999999}},
			},
		},
	},
	networks: {
		default: {
			type: 'edr-simulated',
			chainType: 'l1',
			accounts: {
				mnemonic: process.env.MNEMONIC || 'test test test test test test test test test test test junk',
			},
		},
		// Testnets where the read-after-deploy race reproduces.
		// Reviewers set DEPLOYER_PRIVATE_KEY in .env (gitignored) before running.
		optimismSepolia: {
			type: 'http',
			url: process.env.ETH_NODE_URI_OPTIMISM_SEPOLIA || 'https://sepolia.optimism.io',
			accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
		},
		baseSepolia: {
			type: 'http',
			url: process.env.ETH_NODE_URI_BASE_SEPOLIA || 'https://sepolia.base.org',
			accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
		},
	},
	paths: {sources: ['src']},
	generateTypedArtifacts: {
		destinations: [{folder: './generated', mode: 'typescript'}],
	},
	externalArtifacts: {
		modules: ['@rocketh/proxy/artifacts'],
	},
};

export default config;
