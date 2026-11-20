// Explicit opt-in process runner; never installed as an automatic Studio startup task.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { validateSegmentRequest, segmentArgs } from './contract.mjs';

const worker = join(dirname(fileURLToPath(import.meta.url)), 'segment.py');
/**
 * @param {object} input Valid image request
 * @param {{python?: string, signal?: AbortSignal, timeoutMs?: number}} options
 */
export async function segmentImage(input, { python = 'python3', signal, timeoutMs = 300000 } = {}) {
  const request = validateSegmentRequest(input);
  if (typeof python !== 'string' || !python.trim()) throw new TypeError('Invalid Python executable');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('Invalid timeout');
  if (signal?.aborted) throw signal.reason ?? new Error('Aborted');
  return await new Promise((resolve, reject) => {
    let stdout = '', stderr = '', settled = false, timedOut = false, cancelled = false, overflow = false;
    const child = spawn(python, [worker, ...segmentArgs(request)], {
      shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const onAbort = () => { cancelled = true; child.kill('SIGKILL'); };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    const max = 1024 * 1024;
    const append = (source, buf) => {
      const next = source + buf.toString('utf8');
      if (next.length > max) { overflow = true; child.kill('SIGKILL'); return next.slice(0, max); }
      return next;
    };
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    const settle = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve(result);
    };
    child.on('error', error => settle(error));
    child.on('close', code => {
      if (cancelled) return settle(signal?.reason instanceof Error ? signal.reason : new Error('SAM 2 worker aborted'));
      if (timedOut) return settle(new Error('SAM 2 worker timed out'));
      if (overflow) return settle(new Error('SAM 2 worker output exceeded limit'));
      if (code !== 0) return settle(new Error(`SAM 2 worker failed (exit ${code}): ${stderr.slice(-2000)}`));
      try {
        const data = JSON.parse(stdout.trim());
        if (data?.ok !== true || typeof data.mask !== 'string') throw new Error('Unexpected worker result');
        settle(null, data);
      } catch (error) { settle(error); }
    });
  });
}
