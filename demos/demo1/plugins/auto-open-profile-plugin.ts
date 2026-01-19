/**
 * Vite 插件：自动打开 Profile 文件
 * 提供一个 HTTP 端点接收 profile 文件，并自动使用 speedscope 打开
 */

import type { Plugin } from 'vite';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export function autoOpenProfilePlugin(): Plugin {
  return {
    name: 'auto-open-profile-plugin',
    configureServer(server) {
      // 创建临时目录存储 profile 文件
      const tempDir = path.join(os.tmpdir(), 'perf-monitor-profiles');
      
      // 确保临时目录存在
      fs.mkdir(tempDir, { recursive: true }).catch(console.error);

      // 添加中间件处理 profile 保存和打开请求
      server.middlewares.use('/__perf_monitor__/save-and-open', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        try {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const { profile, filename } = JSON.parse(body);
              
              if (!profile) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Profile data is required' }));
                return;
              }

              // 保存文件到临时目录
              const filePath = path.join(tempDir, filename || `profile-${Date.now()}.cpuprofile`);
              await fs.writeFile(filePath, JSON.stringify(profile, null, 2), 'utf-8');
              
              console.log(`[Auto Open Plugin] Profile 已保存到: ${filePath}`);

              // 使用 npx 打开 speedscope（自动处理安装）
              // 使用 --yes 标志自动确认 npx 提示
              const command = `npx --yes speedscope "${filePath}"`;
              console.log(`[Auto Open Plugin] 执行命令: ${command}`);
              
              // 异步执行，不阻塞响应
              exec(command, { 
                env: { ...process.env, FORCE_COLOR: '0' }
              }, (error, stdout, stderr) => {
                if (error) {
                  console.error('[Auto Open Plugin] 无法打开 speedscope:', error.message);
                  console.log(`[Auto Open Plugin] 请手动运行: ${command}`);
                  console.log(`[Auto Open Plugin] 文件已保存到: ${filePath}`);
                } else {
                  if (stdout) console.log('[Auto Open Plugin]', stdout);
                  if (stderr && !stderr.includes('WARN')) console.warn('[Auto Open Plugin]', stderr);
                }
              });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: `Profile 已保存并尝试打开: ${filePath}`,
                filePath,
              }));
            } catch (parseError) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ 
                error: 'Invalid JSON: ' + (parseError instanceof Error ? parseError.message : String(parseError))
              }));
            }
          });
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }));
        }
      });

      // 添加中间件处理多个 profile 保存请求（用于集成页面）
      server.middlewares.use('/__perf_monitor__/save-profiles', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        try {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const { profiles, sessionId } = JSON.parse(body);
              
              if (!profiles || !Array.isArray(profiles)) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'profiles array is required' }));
                return;
              }

              const sessionIdToUse = sessionId || `session-${Date.now()}`;
              const savedProfiles: Array<{ threadId: string; url: string }> = [];

              // 保存每个线程的 profile 文件
              for (const { threadId, profile } of profiles) {
                if (!threadId || !profile) continue;

                const filename = `${sessionIdToUse}-${threadId}.speedscope.json`;
                const filePath = path.join(tempDir, filename);
                await fs.writeFile(filePath, JSON.stringify(profile, null, 2), 'utf-8');
                
                // 构建可访问的 URL
                const profileUrl = `/__perf_monitor__/profiles/${filename}`;
                savedProfiles.push({ threadId, url: profileUrl });
                
                console.log(`[Auto Open Plugin] Profile 已保存: ${threadId} -> ${filePath}`);
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                sessionId: sessionIdToUse,
                profiles: savedProfiles,
              }));
            } catch (parseError) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ 
                error: 'Invalid JSON: ' + (parseError instanceof Error ? parseError.message : String(parseError))
              }));
            }
          });
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }));
        }
      });

      // 添加列表接口（动态列出某个 session 的所有 profile 文件）
      server.middlewares.use('/__perf_monitor__/list-profiles', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        try {
          // 解析查询参数
          const url = new URL(req.url!, `http://${req.headers.host}`);
          const sessionId = url.searchParams.get('sessionId');

          if (!sessionId) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'sessionId query parameter is required' }));
            return;
          }

          // 读取目录中的所有文件
          const files = await fs.readdir(tempDir);
          
          // 过滤出该 session 的所有 profile 文件
          const profiles = files
            .filter(f => f.startsWith(`${sessionId}-`) && f.endsWith('.speedscope.json'))
            .map(f => {
              // 从文件名提取 threadId
              // 文件名格式: ${sessionId}-${threadId}.speedscope.json
              const threadId = f.replace(`${sessionId}-`, '').replace('.speedscope.json', '');
              return {
                threadId,
                url: `/__perf_monitor__/profiles/${f}`,
                filename: f,
              };
            });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ profiles }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }));
        }
      });

      // 添加静态文件访问端点（提供 profile 文件的 HTTP 访问）
      server.middlewares.use('/__perf_monitor__/profiles', async (req, res) => {
        if (!req.url) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }

        try {
          const filename = path.basename(req.url);
          const filePath = path.join(tempDir, filename);

          // 检查文件是否存在
          try {
            await fs.access(filePath);
          } catch {
            res.statusCode = 404;
            res.end('Profile file not found');
            return;
          }

          // 读取文件内容
          const content = await fs.readFile(filePath, 'utf-8');
          
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(content);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }));
        }
      });

      console.log('[Auto Open Plugin] Profile 自动打开功能已启用');
      console.log('[Auto Open Plugin] 端点: /__perf_monitor__/save-and-open (单个文件)');
      console.log('[Auto Open Plugin] 端点: /__perf_monitor__/save-profiles (多个文件)');
      console.log('[Auto Open Plugin] 端点: /__perf_monitor__/list-profiles?sessionId=xxx (列出文件)');
      console.log('[Auto Open Plugin] 端点: /__perf_monitor__/profiles/* (静态文件访问)');
    },
  };
}
