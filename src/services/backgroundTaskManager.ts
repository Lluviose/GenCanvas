/**
 * 后台任务管理器
 * 用于在手机浏览器退出后台时保持任务稳定性
 */

import { toast } from '@/components/ui/toast';

const ACTIVE_TASKS_KEY = 'photopro:active-generation-tasks';
const TASK_TIMEOUT_MS = 5 * 60 * 1000; // 5分钟超时

export interface ActiveTask {
  id: string;
  nodeId: string;
  startedAt: number;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  error?: string;
  completedAt?: number;
}

class BackgroundTaskManager {
  private wakeLock: WakeLockSentinel | null = null;
  private isInitialized = false;
  private visibilityHandler: (() => void) | null = null;

  /**
   * 初始化管理器，设置可见性监听
   */
  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.visibilityHandler = this.handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // 页面加载时检查未完成任务
    if (document.visibilityState === 'visible') {
      this.checkInterruptedTasks();
    }
  }

  /**
   * 销毁管理器
   */
  destroy() {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.releaseWakeLock();
    this.isInitialized = false;
  }

  /**
   * 处理页面可见性变化
   */
  private async handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      // 页面恢复可见
      await this.requestWakeLock();
      this.checkInterruptedTasks();
    } else {
      // 页面进入后台 - 标记所有运行中的任务
      this.markTasksAsBackgrounded();
    }
  }

  /**
   * 请求屏幕唤醒锁（防止屏幕关闭时被挂起）
   */
  async requestWakeLock(): Promise<boolean> {
    if (!('wakeLock' in navigator)) {
      return false;
    }

    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
      return true;
    } catch {
      // Wake lock 请求失败（可能是页面不可见或权限问题）
      return false;
    }
  }

  /**
   * 释放唤醒锁
   */
  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  /**
   * 获取所有活动任务
   */
  private getActiveTasks(): ActiveTask[] {
    try {
      const raw = localStorage.getItem(ACTIVE_TASKS_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as ActiveTask[];
    } catch {
      return [];
    }
  }

  /**
   * 保存活动任务
   */
  private saveActiveTasks(tasks: ActiveTask[]) {
    try {
      localStorage.setItem(ACTIVE_TASKS_KEY, JSON.stringify(tasks));
    } catch {
      // 存储失败，忽略
    }
  }

  /**
   * 开始一个生成任务
   */
  async startTask(nodeId: string): Promise<string> {
    // 请求 wake lock
    await this.requestWakeLock();

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task: ActiveTask = {
      id: taskId,
      nodeId,
      startedAt: Date.now(),
      status: 'running',
    };

    const tasks = this.getActiveTasks();
    tasks.push(task);
    this.saveActiveTasks(tasks);

    return taskId;
  }

  /**
   * 标记任务完成
   */
  completeTask(taskId: string) {
    const tasks = this.getActiveTasks();
    const updated = tasks.map((t) =>
      t.id === taskId
        ? { ...t, status: 'completed' as const, completedAt: Date.now() }
        : t
    );
    // 只保留最近的任务，清理已完成的
    const filtered = updated.filter(
      (t) => t.status === 'running' || Date.now() - (t.completedAt || t.startedAt) < 60000
    );
    this.saveActiveTasks(filtered);

    // 如果没有运行中的任务，释放 wake lock
    if (!filtered.some((t) => t.status === 'running')) {
      this.releaseWakeLock();
    }
  }

  /**
   * 标记任务失败
   */
  failTask(taskId: string, error?: string) {
    const tasks = this.getActiveTasks();
    const updated = tasks.map((t) =>
      t.id === taskId
        ? { ...t, status: 'failed' as const, error, completedAt: Date.now() }
        : t
    );
    const filtered = updated.filter(
      (t) => t.status === 'running' || Date.now() - (t.completedAt || t.startedAt) < 60000
    );
    this.saveActiveTasks(filtered);

    if (!filtered.some((t) => t.status === 'running')) {
      this.releaseWakeLock();
    }
  }

  /**
   * 当页面进入后台时，标记任务可能被中断
   */
  private markTasksAsBackgrounded() {
    // 不改变状态，只是记录时间点，用于后续检测
    const tasks = this.getActiveTasks();
    const updated = tasks.map((t) =>
      t.status === 'running' ? { ...t, backgroundedAt: Date.now() } : t
    );
    this.saveActiveTasks(updated as ActiveTask[]);
  }

  /**
   * 检查并处理可能被中断的任务
   */
  checkInterruptedTasks(): { interrupted: ActiveTask[]; running: ActiveTask[] } {
    const tasks = this.getActiveTasks();
    const now = Date.now();
    const interrupted: ActiveTask[] = [];
    const stillRunning: ActiveTask[] = [];

    for (const task of tasks) {
      if (task.status !== 'running') continue;

      // 如果任务运行时间超过超时时间，认为被中断
      if (now - task.startedAt > TASK_TIMEOUT_MS) {
        interrupted.push({ ...task, status: 'interrupted' });
      } else {
        stillRunning.push(task);
      }
    }

    // 更新存储
    if (interrupted.length > 0) {
      const updated = tasks.map((t) => {
        const isInterrupted = interrupted.some((i) => i.id === t.id);
        return isInterrupted ? { ...t, status: 'interrupted' as const } : t;
      });
      this.saveActiveTasks(updated);

      // 通知用户
      toast.warning(
        `检测到 ${interrupted.length} 个生成任务可能已中断，请检查节点状态`,
        { duration: 5000 }
      );
    }

    return { interrupted, running: stillRunning };
  }

  /**
   * 获取节点的运行中任务
   */
  getRunningTaskForNode(nodeId: string): ActiveTask | null {
    const tasks = this.getActiveTasks();
    return tasks.find((t) => t.nodeId === nodeId && t.status === 'running') || null;
  }

  /**
   * 清理所有任务记录
   */
  clearAllTasks() {
    this.saveActiveTasks([]);
    this.releaseWakeLock();
  }

  /**
   * 检查是否有任何运行中的任务
   */
  hasRunningTasks(): boolean {
    return this.getActiveTasks().some((t) => t.status === 'running');
  }
}

export const bgTaskManager = new BackgroundTaskManager();
