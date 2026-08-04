/**
 * ============================================================
 *  LiveDataPoller — 模拟「定时请求 → 走 update 流程」的轮询适配器
 *
 *  把一份模拟数据按固定间隔下发给 3D 场景的 update 流程（handle.update）。
 *  与具体框架解耦：只产 SceneUpdatePatch，由调用方决定怎么 update。
 *
 *  典型用法（embed.vue 独立调试）：
 *    const poller = new LiveDataPoller({
 *      url: '/live-data-handlers-update.json',
 *      onPatch: (patch) => handle.update(patch),
 *    })
 *    await poller.start()
 *    onUnmounted(() => poller.stop())
 *
 *  数据格式：
 *    静态 mock（refetch=false，默认）—— 一次 fetch 拿到全部帧，按 intervalMs 循环下发：
 *      { "intervalMs": 2000, "frames": [ { "objects": { "upsert": [...], "remove": [...] } }, ... ] }
 *      每帧即一个 SceneUpdatePatch。
 *
 *    真实后端（refetch=true）—— 每个间隔都重新 fetch，响应体直接当作一个 SceneUpdatePatch 下发：
 *      { "objects": { "upsert": [...], "remove": [...] } }
 * ============================================================
 */
import type { SceneUpdatePatch } from '@/3d';

export interface LiveDataPollerOptions {

  /** 模拟数据 / 轮询接口地址 */
  url: string

  /** 轮询间隔（ms）。缺省取静态 mock 内的 intervalMs，再缺省 2000 */
  intervalMs?: number

  /** 收到一帧增量补丁 → 走 update 流程（如 handle.update(patch)） */
  onPatch: (patch: SceneUpdatePatch) => void

  /** 错误回调（fetch 失败 / onPatch 抛错） */
  onError?: (err: unknown) => void

  /**
   * true：每个间隔都重新 fetch（对接真实轮询接口，响应体即一个 SceneUpdatePatch）。
   * false（默认）：仅 fetch 一次模拟数据帧表，按帧循环下发。
   */
  refetch?: boolean

  /** 是否循环播放帧（仅 refetch=false 生效），默认 true */
  loop?: boolean
}

/** 静态 mock 的帧表结构 */
interface MockFeed {
  intervalMs?: number
  frames?: SceneUpdatePatch[]
}

/**
 * 定时请求模拟数据并下发 SceneUpdatePatch 的轮询器。
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

    if (this.opts.refetch) {
      // 真实轮询：立即发一次 + 每个间隔发一次
      this._running = true;
      await this._tickRefetch();
      const interval = this.opts.intervalMs ?? 2000;
      this.timer = setInterval(() => {
        void this._tickRefetch();
      }, interval);
      return;
    }

    // 静态 mock：fetch 一次帧表后循环下发
    const feed = await this._fetchFeed();
    this.frames = feed.frames ?? [];
    if (this.frames.length === 0) {
      return;
    }
    const interval = this.opts.intervalMs ?? feed.intervalMs ?? 2000;
    this._running = true;
    this._emitFrame();
    this.timer = setInterval(() => this._emitFrame(), interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._running = false;
  }

  /** 下发下一帧（静态 mock 模式） */
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
    try {
      this.opts.onPatch(patch);
    } catch (err) {
      this.opts.onError?.(err);
    }
  }

  /** 每个间隔重新 fetch 一次（真实轮询模式） */
  private async _tickRefetch(): Promise<void> {
    try {
      const res = await fetch(this.opts.url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${this.opts.url}`);
      }
      const patch = (await res.json()) as SceneUpdatePatch;
      this.opts.onPatch(patch);
    } catch (err) {
      this.opts.onError?.(err);
    }
  }

  /** 首次拉取静态 mock 帧表 */
  private async _fetchFeed(): Promise<MockFeed> {
    try {
      const res = await fetch(this.opts.url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${this.opts.url}`);
      }
      return (await res.json()) as MockFeed;
    } catch (err) {
      this.opts.onError?.(err);
      return { frames: [] };
    }
  }
}
