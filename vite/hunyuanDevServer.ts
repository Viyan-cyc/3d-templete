/**
 * hunyuanDevServer — dev 阶段腾讯云混元生3D 中转中间件
 *
 * 浏览器 iframe 不能直连腾讯云（CORS + TC3 签名 + 密钥泄露），故由 vite dev server
 * 在 node 侧代理：读 .env.local 密钥（无 VITE_ 前缀，不进前端 bundle）→ TC3-HMAC-SHA256
 * 签名 → SubmitHunyuanTo3DProJob 提交 → QueryHunyuanTo3DProJob 轮询 → 下载结果 zip
 * → 解压取 .glb → 返回 GLB bytes。prompt→GLB 内存缓存（dev 跨 reload 复用，省 credits）。
 * 仅 dev（configureServer 只在 vite dev 触发，build 不走）；prod 由 host desktop IPC 中转（留后续 Step）。
 * 前端 src/3d/resources/hunyuan.ts fetch /hunyuan/generate?prompt=...；失败回落 low-poly 兜底。
 */
import { createHmac, createHash } from 'node:crypto';
import { loadEnv, type Plugin } from 'vite';
import AdmZip from 'adm-zip';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface Creds {
  secretId: string;
  secretKey: string;
  region: string;
}

interface ResultFile {
  Url: string;
  PreviewImageUrl?: string;
  Type?: string;
}

const SERVICE = 'ai3d';
const HOST = `${SERVICE}.tencentcloudapi.com`;
const VERSION = '2025-05-13';
const ENDPOINT = `https://${HOST}/`;
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 180000;

// ── TC3-HMAC-SHA256 v3 签名 ──

const sha256Hex = (data: string): string =>
  createHash('sha256').update(data, 'utf8').digest('hex');

const hmacSha256 = (key: string | Buffer, data: string): Buffer =>
  createHmac('sha256', key).update(data, 'utf8').digest();

// 计算 Authorization 头。body 须与 fetch 实际发送字节一致（一次序列化，签名与请求共用）。
const tc3Sign = (params: {
  secretId: string;
  secretKey: string;
  action: string;
  region: string;
  timestamp: number;
  body: string;
}): string => {
  const { secretId, secretKey, action, region, timestamp, body } = params;
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  // 签名头（小写名升序；不含 Authorization 本身）
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    host: HOST,
    'x-tc-action': action.toLowerCase(),
    'x-tc-region': region,
    'x-tc-timestamp': String(timestamp),
    'x-tc-version': VERSION,
  };
  const sorted = Object.keys(headers).sort();
  const canonicalHeaders = sorted.map((k) => `${k}:${headers[k].trim()}\n`).join('');
  const signedHeaders = sorted.join(';');
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256Hex(body)}`;
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;
  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, SERVICE);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = hmacSha256(secretSigning, stringToSign).toString('hex');
  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
};

// ── 腾讯云 API 调用（签名 + 请求 + Response.Error 检查）──

const callHunyuanApi = async (
  action: string,
  payload: Record<string, unknown>,
  creds: Creds,
): Promise<Record<string, unknown>> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(payload);
  const authorization = tc3Sign({
    secretId: creds.secretId,
    secretKey: creds.secretKey,
    action,
    region: creds.region,
    timestamp,
    body,
  });
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Host: HOST,
      'X-TC-Action': action,
      'X-TC-Version': VERSION,
      'X-TC-Region': creds.region,
      'X-TC-Timestamp': String(timestamp),
      Authorization: authorization,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`hunyuan ${action} HTTP ${res.status}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const resp = json.Response as Record<string, unknown> | undefined;
  if (!resp) {
    throw new Error(`hunyuan ${action} 无 Response 字段`);
  }
  const errObj = resp.Error as Record<string, unknown> | undefined;
  if (errObj) {
    const code = (errObj.Code as string | undefined) ?? '';
    const message = (errObj.Message as string | undefined) ?? '';
    throw new Error(`hunyuan ${action} ${code}: ${message}`);
  }
  return resp;
};

// ── 提交 → 轮询 → 下载解压 ──

const submitJob = async (prompt: string, creds: Creds): Promise<string> => {
  const resp = await callHunyuanApi(
    'SubmitHunyuanTo3DProJob',
    { Prompt: prompt, Model: '3.0', FaceCount: 500000, GenerateType: 'Normal' },
    creds,
  );
  const jobId = resp.JobId as string | undefined;
  if (!jobId) {
    throw new Error('混元提交未返回 JobId');
  }
  return jobId;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// 单次查询带重试（网络错重试 ≤2 次，2s 间隔）
const queryJob = async (jobId: string, creds: Creds): Promise<Record<string, unknown>> => {
  let lastErr: unknown = new Error('query failed');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await callHunyuanApi('QueryHunyuanTo3DProJob', { JobId: jobId }, creds);
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        await sleep(2000);
      }
    }
  }
  throw lastErr;
};

const pollUntilDone = async (jobId: string, creds: Creds): Promise<ResultFile[]> => {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const resp = await queryJob(jobId, creds);
    const status = resp.Status as string | undefined;
    if (status === 'DONE') {
      const files = resp.ResultFile3Ds as ResultFile[] | undefined;
      if (!files || files.length === 0) {
        throw new Error('混元 DONE 但无 ResultFile3Ds');
      }
      return files;
    }
    if (status === 'FAIL') {
      const code = (resp.ErrorCode as string | undefined) ?? '';
      const message = (resp.ErrorMessage as string | undefined) ?? '';
      throw new Error(`混元任务失败 ${jobId}: ${code} ${message}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`混元轮询超时 ${jobId}`);
};

// 鲁棒取 GLB：按 magic bytes 判 zip / 原始 GLB，zip 则解压找 .glb。
const extractGlbFromBuffer = (buf: Buffer): ArrayBuffer | null => {
  // GLB magic = 'glTF'（0x67 0x6c 0x54 0x46）
  if (buf.length >= 4 && buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46) {
    // Buffer.buffer 类型为 ArrayBufferLike，底层实为 ArrayBuffer，cast 安全
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  // ZIP magic = 'PK\x03\x04'
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    const zip = new AdmZip(buf);
    for (const entry of zip.getEntries()) {
      if (entry.entryName.toLowerCase().endsWith('.glb')) {
        const data = entry.getData();
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      }
    }
  }
  return null;
};

const downloadAndExtractGlb = async (files: ResultFile[]): Promise<ArrayBuffer> => {
  for (const file of files) {
    if (!file.Url) {
      continue;
    }
    const res = await fetch(file.Url);
    if (!res.ok) {
      continue;
    }
    const glb = extractGlbFromBuffer(Buffer.from(await res.arrayBuffer()));
    if (glb) {
      return glb;
    }
  }
  throw new Error('下载结果中未找到 GLB');
};

// ── 凭证 + 缓存 + 请求编排 ──

const loadCreds = (): Creds | null => {
  // prefixes='' 加载全部 env（含无 VITE_ 前缀的 HUNYUAN_*）；.env.local 被 *.local 覆盖不入库
  const env = loadEnv('development', process.cwd(), '');
  const secretId = env.HUNYUAN_SECRET_ID;
  const secretKey = env.HUNYUAN_SECRET_KEY;
  const region = env.HUNYUAN_REGION || 'ap-guangzhou';
  if (!secretId || !secretKey) {
    return null;
  }
  return { secretId, secretKey, region };
};

// dev 内存缓存：同 prompt 跨请求复用（省 credits；重启 dev 清空）
const glbCache = new Map<string, ArrayBuffer>();

const handleGenerate = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const prompt = new URL(req.url ?? '/', 'http://x').searchParams.get('prompt');
  if (!prompt) {
    respond(res, 400, 'missing prompt');
    return;
  }
  const cached = glbCache.get(prompt);
  if (cached) {
    respondGlb(res, cached);
    return;
  }
  const creds = loadCreds();
  if (!creds) {
    respond(res, 503, 'NO_CREDENTIALS');
    return;
  }
  try {
    const jobId = await submitJob(prompt, creds);
    const files = await pollUntilDone(jobId, creds);
    const glb = await downloadAndExtractGlb(files);
    glbCache.set(prompt, glb);
    respondGlb(res, glb);
  } catch (err) {
    respond(res, 504, `hunyuan failed: ${(err as Error).message}`);
  }
};

const respond = (res: ServerResponse, status: number, message: string): void => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: message }));
};

const respondGlb = (res: ServerResponse, bytes: ArrayBuffer): void => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'model/gltf-binary');
  res.end(Buffer.from(bytes));
};

/** vite 插件：dev server 注册 /hunyuan/generate 中间件。仅 dev 触发（build 不调 configureServer）。 */
export function hunyuanDevServer(): Plugin {
  return {
    name: 'hunyuan-dev-server',
    configureServer(server) {
      server.middlewares.use('/hunyuan/generate', (req, res) => {
        // handleGenerate 内部已 try/catch 全兜底；外层 .catch 仅防 respond 自身意外抛
        handleGenerate(req, res).catch((err) => {
          console.error('[hunyuanDevServer] unhandled', err);
        });
      });
    },
  };
}
