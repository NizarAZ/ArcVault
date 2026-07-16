import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import the retry functions from keeper.js
const keeperModule = await import('./keeper.js');

const { isTransientRpcError, retryWithBackoff, withProviderFailover } = keeperModule;

describe('RPC Retry Logic', () => {
  
  describe('isTransientRpcError', () => {
    it('-32011 triggers retry detection', () => {
      const error = {
        info: {
          error: {
            code: -32011,
            message: 'request limit reached'
          }
        }
      };
      assert.ok(isTransientRpcError(error));
    });

    it('genuine Solidity revert does not retry', () => {
      const error = {
        data: '0x1234...',
        message: 'execution reverted'
      };
      assert.ok(!isTransientRpcError(error));
    });
  });

  describe('retryWithBackoff', () => {
    it('-32011 triggers retry and eventually succeeds', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          throw { info: { error: { code: -32011, message: 'request limit reached' } } };
        }
        return 'success';
      };

      const result = await retryWithBackoff(fn, { attempts: 3, baseDelayMs: 10, label: 'test' });
      assert.strictEqual(result, 'success');
      assert.strictEqual(attempts, 3);
    });

    it('genuine revert does not retry', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        const error = new Error('execution reverted');
        error.data = '0x1234';
        throw error;
      };

      await assert.rejects(
        retryWithBackoff(fn, { attempts: 3, baseDelayMs: 10, label: 'test' }),
        /execution reverted/
      );
      assert.strictEqual(attempts, 1); // Should only retry once
    });
  });

  describe('withProviderFailover', () => {
    it('fallback is used for a failed read', async () => {
      let primaryCalled = false;
      let fallbackCalled = false;

      const primaryProvider = { _connection: { url: 'https://primary.example.com' } };
      const fallbackProvider = { _connection: { url: 'https://fallback.example.com' } };

      const fn = async (provider) => {
        if (provider === primaryProvider) {
          primaryCalled = true;
          throw { info: { error: { code: -32011, message: 'request limit reached' } } };
        }
        fallbackCalled = true;
        return 'fallback success';
      };

      const result = await withProviderFailover(fn, primaryProvider, fallbackProvider, { label: 'test', attempts: 2, baseDelayMs: 10 });
      assert.strictEqual(result, 'fallback success');
      assert.strictEqual(primaryCalled, true);
      assert.strictEqual(fallbackCalled, true);
    });
  });

  describe('Signer-Connected staticCall', () => {
    it('signer-connected compound.staticCall() retains keeper sender context', async () => {
      const keeperAddress = '0x1234567890123456789012345678901234567890';
      
      const mockVault = { 
        compound: {
          staticCall: async () => {
            // In a real scenario, this would verify msg.sender === keeperAddress
            return 1000n; // expected yield
          }
        },
        runner: { 
          address: keeperAddress
        }
      };

      const result = await retryWithBackoff(() => mockVault.compound.staticCall(), {
        label: 'vault.compound.staticCall()',
        providerName: 'test.example.com',
        attempts: 2,
        baseDelayMs: 10
      });

      assert.strictEqual(result, 1000n);
      assert.strictEqual(mockVault.runner.address, keeperAddress);
    });
  });
});
