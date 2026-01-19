/**
 * Worker 性能数据 IndexedDB 存储
 * 用于在 Worker 线程中缓存性能数据，避免实时发送到主线程
 */

import type { WorkerPerformanceData } from '../types/index.js';

const DB_NAME = 'perf-monitor-worker-data';
const STORE_NAME = 'performance-data';
const VERSION = 1;

export class WorkerProfilerStorage {
  private db: IDBDatabase | null = null;
  private workerId: string;
  private initialized: boolean = false;

  constructor(workerId: string) {
    this.workerId = workerId;
  }

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    if (this.initialized && this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);

      request.onerror = () => {
        console.error('[WorkerProfilerStorage] 数据库打开失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          store.createIndex('workerId', 'workerId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * 保存性能数据
   */
  async save(data: WorkerPerformanceData): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    if (!this.db) {
      throw new Error('[WorkerProfilerStorage] 数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const record = {
        workerId: this.workerId,
        data,
        timestamp: Date.now(),
      };

      const request = store.add(record);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('[WorkerProfilerStorage] 保存数据失败:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 批量保存性能数据
   */
  async saveBatch(dataList: WorkerPerformanceData[]): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    if (!this.db) {
      throw new Error('[WorkerProfilerStorage] 数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      let completed = 0;
      let hasError = false;

      dataList.forEach((data) => {
        const record = {
          workerId: this.workerId,
          data,
          timestamp: Date.now(),
        };

        const request = store.add(record);
        request.onsuccess = () => {
          completed++;
          if (completed === dataList.length && !hasError) {
            resolve();
          }
        };
        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            console.error('[WorkerProfilerStorage] 批量保存数据失败:', request.error);
            reject(request.error);
          }
        };
      });
    });
  }

  /**
   * 获取该 Worker 的所有性能数据
   */
  async getAllData(): Promise<WorkerPerformanceData[]> {
    if (!this.db) {
      await this.init();
    }

    if (!this.db) {
      throw new Error('[WorkerProfilerStorage] 数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('workerId');
      
      const request = index.getAll(this.workerId);
      request.onsuccess = () => {
        const records = request.result;
        // 按时间戳排序
        records.sort((a, b) => a.timestamp - b.timestamp);
        const data = records.map(r => r.data);
        resolve(data);
      };
      request.onerror = () => {
        console.error('[WorkerProfilerStorage] 获取数据失败:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 清空该 Worker 的数据
   */
  async clear(): Promise<void> {
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('workerId');
      
      const request = index.getAllKeys(this.workerId);
      request.onsuccess = () => {
        const keys = request.result;
        if (keys.length === 0) {
          resolve();
          return;
        }

        let deleted = 0;
        let hasError = false;

        keys.forEach((key) => {
          const deleteRequest = store.delete(key);
          deleteRequest.onsuccess = () => {
            deleted++;
            if (deleted === keys.length && !hasError) {
              resolve();
            }
          };
          deleteRequest.onerror = () => {
            if (!hasError) {
              hasError = true;
              console.error('[WorkerProfilerStorage] 清空数据失败:', deleteRequest.error);
              reject(deleteRequest.error);
            }
          };
        });
      };
      request.onerror = () => {
        console.error('[WorkerProfilerStorage] 获取键列表失败:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 获取该 Worker 的数据数量
   */
  async getCount(): Promise<number> {
    if (!this.db) {
      await this.init();
    }

    if (!this.db) {
      return 0;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('workerId');
      
      const request = index.count(this.workerId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error('[WorkerProfilerStorage] 获取数据数量失败:', request.error);
        reject(request.error);
      };
    });
  }
}
