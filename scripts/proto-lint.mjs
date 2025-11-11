#!/usr/bin/env node

import { execSync } from "child_process"
import * as fs from "fs/promises"
import { globby } from "globby"
import path from "path"

const PROTO_DIR = path.resolve("proto")

async function main() {
	try {
		// Run buf lint
		console.log("Running buf lint...")
		execSync("buf lint", { stdio: "inherit" })
		console.log("buf lint passed")

		// Run buf format - check if files were formatted
		console.log("Running buf format check...")
		try {
			execSync("buf format -w --exit-code", { stdio: "ignore" })
		} catch (error) {
			if (error.status === 100) {
				// Exit code 100 means files were formatted
				console.log("Proto files were formatted")
			} else {
				throw error
			}
		}
		console.log("buf format check passed")

		// Check for repeated capital letters in RPC names
		await checkRpcNamePattern()
	} catch (error) {
		console.error("Proto linting failed:", error.message)
		process.exit(1)
	}
}

async function checkRpcNamePattern() {
	const protoFiles = await globby("**/*.proto", { cwd: PROTO_DIR })

	let foundRepeatedCaps = false

	for (const protoFile of protoFiles) {
		const filePath = path.join(PROTO_DIR, protoFile)
		const content = await fs.readFile(filePath, "utf8")

		// Check for RPCs with repeated capital letters (PATTERN followed by lowercase)
		// This matches patterns like AAA, BBB, etc. with optional lowercase letters after
		const repeatedCapsRegex = /rpc\s[^(\r\n]*[A-Z]{2,}[a-z]?[^(\r\n]*\(/g

		let match
		while ((match = repeatedCapsRegex.exec(content)) !== null) {
			const lineNumber = content.substring(0, match.index).split("\n").length
			console.error(`Error: Proto RPC names cannot contain repeated capital letters`)
			console.error(`File: ${protoFile}:${lineNumber} - "${match[0].trim()}"`)
			console.error(`See: https://github.com/cline/cline/pull/7054`)
			foundRepeatedCaps = true
		}
	}

	if (foundRepeatedCaps) {
		console.error("RPC name validation failed")
		process.exit(1)
	}

	console.log("RPC name pattern validation passed")
}

// Run the script if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main()
}
