// Regression tests for the compaction-replay fix.
//
// Covers:
//  1. small region  -> unchanged single warm-prefix summarize call
//  2. large region  -> chunked map-reduce; every request stays far below the
//     provider's resident window; each map call starts with a synthetic marker
//     so provider prefix caches break at a shallow depth
//  3. tool-call/tool-result pairs are never split across segments
//  4. the reduce call uses the standard COMPACTION_INSTRUCTION structure
//  5. cancellation still propagates (signal) and image output is rejected
//  6. the request-error recovery now treats the KVMem replay failure like a
//     context-window exhaustion (compaction + retry instead of a dead turn)
//  7. ordinary non-compaction behavior is unchanged (single call shape)
//
// Run: node --test test/compaction-chunk.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// The patched package (workspace copy) imported against the installed runtime's deps.
const patched = require("../dsh-compaction-basic/lib/index.js");
const original = require("../original-baseline/index.js");

const MODEL_CONTEXT = 131072;

function estimateTokens(message) {
	let chars = 0;
	for (const block of message.content ?? []) {
		chars += (block.text ?? "").length;
		for (const inner of block.content ?? []) chars += (inner.text ?? "").length;
	}
	return Math.ceil(chars / 4) + 4;
}

/** Fake harness context recording every llm.stream envelope. */
function makeCtx(t) {
	const calls = [];
	const handlers = {};
	const ctx = {
		calls,
		handlers,
		logger: { info() {}, warn() {}, error() {} },
		tokenMeter: { estimateMessage: estimateTokens },
		sessions: {},
		get() {
			return undefined;
		},
		waterfall(_name, _event, _seed) {
			return Promise.resolve(false);
		},
		on(name, handler) {
			handlers[name] = handler;
		},
		llm: {
			async *stream(options) {
				calls.push(options);
				if (t.errorAfterFirst) {
					yield { type: "finish", reason: { kind: "error", failure: { message: t.errorAfterFirst, code: "SERVER" } } };
					return;
				}
				if (t.imageOutput) {
					yield { type: "block-end", index: 0, block: { type: "image", image: { kind: "placeholder" } } };
					yield { type: "finish", reason: { kind: "stop" } };
					return;
				}
				const prompt = options.messages[options.messages.length - 1]?.content?.[0]?.text ?? "";
				// Deterministic filler whose length tracks the request so the
				// framed checkpoint stays smaller than the shadowed content.
				yield { type: "text-delta", index: 0, text: `SUMMARY-OF(${prompt.slice(0, 40)}...) markers kept.` };
				yield { type: "block-end", index: 0, block: { type: "text", text: `SUMMARY-OF(${prompt.slice(0, 40)}...) markers kept.` } };
				yield { type: "usage", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
				yield { type: "finish", reason: { kind: "stop" } };
			}
		}
	};
	return ctx;
}

function makeAgent() {
	const session = {
		id: "session-test",
		requestHeader() {
			return { config: { provider: "qqz-kvmem", model: "test-model" } };
		}
	};
	return { session, options: {} };
}

function userText(text) {
	return {
		role: "user",
		content: [{ type: "text", text }],
		source: { kind: "user" }
	};
}

function assistantToolCall(id) {
	return {
		role: "assistant",
		content: [{ type: "tool-call", toolCallId: id, name: "read_file", arguments: "{}" }],
		source: { kind: "model", provider: "qqz-kvmem", model: "test-model" }
	};
}

function toolResult(id, text) {
	return {
		role: "user",
		content: [{ type: "tool-result", toolCallId: id, content: [{ type: "text", text }], isError: false }],
		source: { kind: "tool", callId: id }
	};
}

function largeRegion(steps, stepTokens = 2400) {
	const messages = [userText("Start the task.")];
	const filler = "d".repeat(stepTokens * 4);
	for (let i = 0; i < steps; i += 1) {
		messages.push(userText(`Step ${i}: read the file.`));
		messages.push(assistantToolCall(`call-${i}`));
		messages.push(toolResult(`call-${i}`, filler));
	}
	return { messages, tools: [{ name: "read_file" }] };
}

const SMOKE_CONFIG = {
	thresholdRatio: 0.8,
	retainRatio: 0.16,
	summarizationProvider: "",
	summarizationModel: "",
	maxTokens: 8192,
	compactionRetries: 1,
	maxOverflowRetries: 1,
	modelPolicies: [],
	auto: false
};

/** Build the engine on its prototype: all compaction logic is plain JS on
* `this`, so the tests avoid booting a full cordis context. */
function makeEngine(ctx) {
	const engine = Object.create(patched.BasicCompactionEngine.prototype);
	engine.ctx = ctx;
	engine.config = SMOKE_CONFIG;
	engine.warnedPressureConfigTargets = new Set();
	engine.overflowRetries = new WeakMap();
	engine.overflowAgents = new WeakMap();
	engine._registerAutomaticCompaction();
	return engine;
}

test("small region keeps the unchanged single warm-prefix call", () => {
	const ctx = makeCtx({});
	const engine = makeEngine(ctx);
	const input = { messages: [userText("hello ".repeat(400))], tools: [{ name: "read_file" }] };
	const result = engine.summarize(input, makeAgent());
	return result.then((r) => {
		assert.equal(ctx.calls.length, 1);
		// Warm prefix: the conversation's own messages, then the instruction.
		assert.equal(ctx.calls[0].messages.length, 2);
		assert.deepEqual(ctx.calls[0].tools, [{ name: "read_file" }]);
		assert.equal(r.summary.every((block) => block.type === "text"), true);
		assert.equal(r.provider, "qqz-kvmem");
	});
});

test("large region switches to chunked map-reduce with shallow-divergence markers", async () => {
	const ctx = makeCtx({});
	const engine = makeEngine(ctx);
	const input = largeRegion(10);
	const agent = makeAgent();
	const result = await engine.summarize(input, agent);
	assert.ok(ctx.calls.length > 2, "expected map calls plus a reduce call");
	for (const call of ctx.calls) {
		const est = call.messages.reduce((t, m) => t + estimateTokens(m), 0);
		assert.ok(est < 32768, `every chunked request stays inside the resident window (est=${est})`);
	}
	// Map calls start with [system-less marker user message] -> divergence at shallow depth.
	const mapCalls = ctx.calls.slice(0, -1);
	for (const call of mapCalls) {
		assert.equal(call.messages[0].role, "user");
		assert.match(call.messages[0].content[0].text, /^\[compaction segment \d+\/\d+\]$/);
	}
	// The reduce call carries the standard compaction instruction.
	const reduceCall = ctx.calls[ctx.calls.length - 1];
	const reduceInstruction = reduceCall.messages[reduceCall.messages.length - 1].content[0].text;
	assert.match(reduceInstruction, /compaction engine for this AI coding assistant/);
	assert.match(reduceInstruction, /## Primary Request and Intent/);
	assert.equal(result.summary.every((block) => block.type === "text"), true);
});

test("tool-call/result pairs are never split across segments", async () => {
	const ctx = makeCtx({});
	const engine = makeEngine(ctx);
	const input = largeRegion(10);
	await engine.summarize(input, makeAgent());
	for (const call of ctx.calls) {
		for (let i = 1; i < call.messages.length; i += 1) {
			const message = call.messages[i];
			const isToolResult = message.role === "user" && message.content.some((b) => b.type === "tool-result");
			if (isToolResult) {
				const previous = call.messages[i - 1];
				const previousHasCall = previous.content.some((b) => b.type === "tool-call");
				// A tool result is either preceded by its call in the same segment
				// or is not the first real message after the synthetic marker.
				const afterMarker = i >= 2 && /^\[compaction segment /.test(call.messages[i - 2]?.content?.[0]?.text ?? "");
				assert.ok(previousHasCall || afterMarker, "tool result separated from its call");
				if (afterMarker) assert.fail("segment boundary split a tool pair at a marker");
			}
		}
	}
});

test("cancellation still aborts the summarizer", async () => {
	const ctx = makeCtx({});
	const engine = makeEngine(ctx);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		engine.summarize(largeRegion(10), makeAgent(), controller.signal)
	);
});

test("image output from the summarizer is still rejected", async () => {
	const ctx = makeCtx({ imageOutput: true });
	const engine = makeEngine(ctx);
	await assert.rejects(
		engine.summarize(largeRegion(10), makeAgent()),
		/compaction summary cannot contain image output/
	);
});

test("provider stream errors still fail the summarizer", async () => {
	const ctx = makeCtx({ errorAfterFirst: "multimodal query replay failed or cancelled" });
	const engine = makeEngine(ctx);
	await assert.rejects(
		engine.summarize(largeRegion(2), makeAgent()),
		/multimodal query replay failed or cancelled/
	);
});

test("request-error recovery: KVMem replay failure triggers overflow compaction and retry", async () => {
	const ctx = makeCtx({});
	const engine = makeEngine(ctx);
	const handler = ctx.handlers["agent/request-error"];
	assert.ok(handler, "request-error handler registered");

	// One successful compaction; then the retried turn is expected.
	let compacted = 0;
	engine.compactIfNeeded = async () => {
		compacted += 1;
		agent.session.surface.replaceGeneration = 2;
		return { shadowedSeqs: [1], shadowedRange: { start: 1, end: 1 }, shadowedTokenCount: 10 };
	};
	const agent = {
		session: {
			id: "session-test",
			requestHeader() {
				return { config: { provider: "qqz-kvmem", model: "test-model" } };
			},
			surface: { replaceGeneration: 1 }
		},
		options: {}
	};
	const nextCalls = [];
	const action = await handler(
		{ agent, failure: { code: "SERVER", message: 'multimodal query replay failed or cancelled' }, signal: new AbortController().signal },
		() => {
			nextCalls.push(1);
			return Promise.resolve(undefined);
		}
	);
	assert.deepEqual(action, { kind: "retry" });
	assert.equal(compacted, 1);
	assert.equal(nextCalls.length, 0);
});

test("request-error recovery: ordinary failures still pass through untouched", async () => {
	const ctx = makeCtx({});
	const engine = makeEngine(ctx);
	const handler = ctx.handlers["agent/request-error"];
	const nextCalls = [];
	const action = await handler(
		{ agent: makeAgent(), failure: { code: "SERVER", message: "some other provider error" }, signal: new AbortController().signal },
		() => {
			nextCalls.push(1);
			return Promise.resolve(undefined);
		}
	);
	assert.equal(action, undefined);
	assert.equal(nextCalls.length, 1);
});

test("request-error recovery: user cancellation still passes through untouched", async () => {
	const ctx = makeCtx({});
	const engine = makeEngine(ctx);
	const handler = ctx.handlers["agent/request-error"];
	const controller = new AbortController();
	controller.abort();
	const nextCalls = [];
	const action = await handler(
		{ agent: makeAgent(), failure: { code: "CONTEXT_WINDOW_EXCEEDED", message: "context" }, signal: controller.signal },
		() => {
			nextCalls.push(1);
			return Promise.resolve(undefined);
		}
	);
	assert.equal(action, undefined);
	assert.equal(nextCalls.length, 1);
});

test("baseline sanity: the original module still compiles and exposes the engine", () => {
	assert.equal(typeof original.BasicCompactionEngine, "function");
});
