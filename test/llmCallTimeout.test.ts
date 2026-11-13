import { assert } from "chai";
import { callLLMWithTimeout } from "../src/utils/llmCallTimeout";
import { registerModelLoadTimeoutLookup } from "../src/utils/modelLoadTimeout";

describe("bounded utility cancellation", function () {
  it("uses Zotero's window controller when the chrome global lacks one", async function () {
    const host = globalThis as any;
    const saved = {
      Zotero: host.Zotero,
      AbortController: host.AbortController,
    };
    try {
      host.AbortController = undefined;
      host.Zotero = {
        getMainWindow: () => ({ AbortController: saved.AbortController }),
      };
      await callLLMWithTimeout({
        prompt: "Interpret",
        timeoutMs: 50,
        llmCall: async (params) => {
          assert.exists(params.signal);
          return { text: "{}", completion: { status: "complete" } };
        },
      });
    } finally {
      Object.assign(host, saved);
    }
  });
  it("ends immediately on parent cancellation even if the transport ignores its signal", async function () {
    const controller = new AbortController();
    const call = callLLMWithTimeout({
      prompt: "Interpret",
      timeoutMs: 30,
      parentSignal: controller.signal,
      llmCall: () => new Promise(() => {}),
    });
    controller.abort();
    try {
      await call;
      assert.fail("Expected cancellation");
    } catch (error) {
      assert.equal((error as Error).name, "AbortError");
    }
  });

  describe("model load timeout", function () {
    afterEach(function () {
      registerModelLoadTimeoutLookup(null);
    });

    it("waits at least the configured load timeout for that model", async function () {
      registerModelLoadTimeoutLookup(({ model }) =>
        model === "local-model" ? 0.2 : undefined,
      );
      const outcome = await callLLMWithTimeout({
        prompt: "Interpret",
        model: "local-model",
        apiBase: "http://localhost:1234/v1",
        timeoutMs: 20,
        llmCall: () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ text: "{}", completion: { status: "complete" } }),
              80,
            ),
          ),
      });
      assert.equal(outcome.text, "{}");
    });

    it("keeps the caller's budget for models without a load timeout", async function () {
      registerModelLoadTimeoutLookup(({ model }) =>
        model === "local-model" ? 5 : undefined,
      );
      try {
        await callLLMWithTimeout({
          prompt: "Interpret",
          model: "other-model",
          timeoutMs: 20,
          llmCall: () => new Promise(() => {}),
        });
        assert.fail("Expected timeout");
      } catch (error) {
        assert.match((error as Error).message, /timed out after 20ms/);
      }
    });
  });
});
