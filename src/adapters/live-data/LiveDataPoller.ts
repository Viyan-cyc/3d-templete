/**
 * ============================================================
 *  LiveDataPoller — 模拟「定时请求 → 下发数据」的轮询适配器
 *
 *  定时 fetch 一个 url，把响应原样下发给 onPatch（不假设格式）。
 *  数据格式判断 + 转换由调用方在 onPatch 里处理：
 *    扁平 patch → handle.update(patch)；全量产品数据 → toUpdatePatch(data) → handle.update。
 *
 *  两种模式（按响应自动判断，无需 refetch 开关）：
 *    帧表 { intervalMs, frames: [...] }：一次 fetch 拿全部帧，按 intervalMs 循环下发每帧
 *    单份（无 frames）：每个间隔重新 fetch，响应原样下发
 *
 *  refetch 选项（兼容旧调用方，默认自动）：
 *    true  强制每个间隔重新 fetch
 *    false 强制帧表模式（fetch 一次循环下发）
 *    不传  自动：有 frames 走帧表，否则 refetch
 * ============================================================
 */
import type { SceneUpdatePatch } from '@/3d';

export interface LiveDataPollerOptions {

  /** 模拟数据 / 轮询接口地址 */
  url: string

  /** 轮询间隔（ms）。缺省取静态 mock 内的 intervalMs，再缺省 2000 */
  intervalMs?: number

  /** 收到一份数据（帧表每帧 / refetch 响应），调用方按格式判断走 update 或 toUpdatePatch */
  onPatch: (data: unknown) => void

  /** 错误回调（fetch 失败 / onPatch 抛错） */
  onError?: (err: unknown) => void

  /**
   * true：强制每个间隔重新 fetch（对接真实轮询接口）。
   * false：强制帧表模式（fetch 一次循环下发）。
   * 不传（默认）：自动——响应有 frames 走帧表，否则 refetch。
   */
  refetch?: boolean

  /** 是否循环播放帧（仅帧表模式生效），默认 true */
  loop?: boolean
}

/** 静态 mock 的帧表结构 */
interface MockFeed {
  intervalMs?: number
  frames?: SceneUpdatePatch[]
}

/** 响应是帧表（有 frames 数组） */
const isFramesFeed = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') {
    return false;
  }
  return Array.isArray((data as Record<string, unknown>).frames);
};

/**
 * 定时请求并下发数据的轮询器。
 *
 * - start()：发起首次请求并启动定时器；重复调用安全（已运行则直接 resolve）。
 * - stop()：停止定时器；可再次 start() 续跑。
 */
export class LiveDataPoller {
  private readonly opts: LiveDataPollerOptions;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frames: SceneUpdatePatch[] = [];
  private cursor = 0;
  private _running = false;

  constructor(opts: LiveDataPollerOptions) {
    this.opts = opts;
  }

  get isRunning(): boolean {
    return this._running;
  }

  async start(): Promise<void> {
    if (this._running) {
      return;
    }

    // 显式 refetch=true：强制 refetch 模式（兼容旧调用方）
    if (this.opts.refetch === true) {
      this._running = true;
      await this._tickRefetch();
      const interval = this.opts.intervalMs ?? 2000;
      this.timer = setInterval(() => {
        void this._tickRefetch();
      }, interval);
      return;
    }

    // 首次 fetch 原始响应，按格式分派模式
    const feed = await this._fetchRaw();

    // 显式 refetch=false（强制帧表）或自动模式且响应是帧表 → 帧表循环
    if (this.opts.refetch === false || isFramesFeed(feed)) {
      this.frames = isFramesFeed(feed) ? (feed as MockFeed).frames ?? [] : [];
      if (this.frames.length === 0) {
        return;
      }
      const feedInterval = isFramesFeed(feed) ? (feed as MockFeed).intervalMs : undefined;
      const interval = this.opts.intervalMs ?? feedInterval ?? 2000;
      this._running = true;
      this._emitFrame();
      this.timer = setInterval(() => this._emitFrame(), interval);
      return;
    }

    // 自动模式 + 无 frames：refetch 模式，首次下发 + 定时 refetch
    this._running = true;
    if (feed !== null) {
      this._safePatch(feed);
    }
    const interval = this.opts.intervalMs ?? 2000;
    this.timer = setInterval(() => {
      void this._tickRefetch();
    }, interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._running = false;
  }

  /** 下发下一帧（帧表模式） */
  private _emitFrame(): void {
    if (this.frames.length === 0) {
      return;
    }
    if (this.cursor >= this.frames.length) {
      if (this.opts.loop === false) {
        this.stop();
        return;
      }
      this.cursor = 0;
    }
    const patch = this.frames[this.cursor++];
    this._safePatch(patch);
  }

  /** 每个间隔重新 fetch 一次（refetch 模式），原样下发 */
  private async _tickRefetch(): Promise<void> {
    try {
      const res = await fetch(this.opts.url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${this.opts.url}`);
      }
      const data = await res.json();
      this._safePatch(data);
    } catch (err) {
      this.opts.onError?.(err);
    }
  }

  /** 下发一份数据，捕获 onPatch 抛错转 onError */
  private _safePatch(data: unknown): void {
    try {
      this.opts.onPatch(data);
    } catch (err) {
      this.opts.onError?.(err);
    }
  }

  /** 首次拉取原始响应（不假设格式） */
  private async _fetchRaw(): Promise<unknown> {
    try {
      const res = await fetch(this.opts.url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${this.opts.url}`);
      }
      return await res.json();
    } catch (err) {
      this.opts.onError?.(err);
      return null;
    }
  }
}
