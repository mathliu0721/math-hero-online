# 数模侠线上版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 完整可玩的网页与微信共房桌游，支持AI补位和语音适配，按证据区分可运行功能与外部接入。

**Architecture:** 独立 Node.js 应用与共享 JS 规则状态机，双端仅接收裁剪视图。原子持久化、逐房串行与动作幂等；音频/模型通过可替换适配器。

**Tech Stack:** Node.js 24 内建 HTTP/测试库、原生 HTML/CSS/JS、微信 Canvas API；不引入重型游戏引擎。

**Spec:** ../specs/2026-11-01-shumoxia-design.md

## Global Constraints

- 优先8人演示，支持8/10/12/14/16；v2+v4、SVD吞噬。
- 原卡面原题库；每人1张公式，每种每白天限1；禁止模拟器全知AI。
- AI与语音月估算上限100元；无密钥模式明确标记。
- 不覆盖旧文件，不购买服务，不替用户验证微信身份。

## Review Focus

- 夜间公共快照、模型提示词及聊天序列是否泄露角色/答案。
- 并发操作和重复请求是否二次消耗牌/药或重启AI。
- 猎人、白痴、傅里叶和终局答题的先后顺序。
- 网络超时及模型故障是否卡住对局或偷偷假装模型成功。
- 手机视口、微信音频及未知平台权限是否如实标记。

## Task 1 游戏状态机及内容

Files: shared/content.mjs, server/game.mjs, tests/game.test.mjs, public/assets/。
Interfaces: createRoom(options), joinRoom(room, options), startGame(room), view(room, playerId), act(room, playerId, action), tick(room, now)。

- [x] 先写规则、视图隐私和公式时序测试并运行，确认因缺少实现而失败。
- [x] 从deck.py抽取卡面内容与唯一题库；裁切实体PDF的角色/公式卡图片，保留原样。
- [x] 实现状态机、夜晚结算、技能、公式、公投、答题与结算。
- [x] node --test tests/game.test.mjs 通过；检查所有配置总人数及全局结果不预设。

## Task 2 同房协议及AI音频

Files: server/http.mjs, server/store.mjs, server/ai.mjs, server/voice.mjs, tests/api.test.mjs, tests/ai.test.mjs。
Interfaces: REST endpoints per spec, per-room authenticated tokens, AI receives only view。

- [x] 先写两个不同会话的创建/加入/操作、幂等、旧版本、恶意身份、AI隐私及预算测试，观察失败。
- [x] 实现逐房串行、原子文件快照、后台阶段计时、可配置模型/ASR/TTS与清晰降级。
- [x] 完成两个真人会话与规则AI的一局集成测试及重启恢复测试。
- [x] node --test tests/*.test.mjs 通过。

## Task 3 网页实玩界面

Files: public/index.html, public/app.js, public/style.css, 启动桌游.cmd / 启动局域网.cmd。
Consumes: Task2 REST and Task1 content；Produces: 响应式完整操作入口。

- [x] 实现创建/加入、座位桌、本人身份及手牌、阶段动作、聊天语音、题目、图鉴与结算。
- [x] 不配置密钥时页面准确标记规则机器人；不得让用户编辑他人身份。
- [ ] 桌面/手机浏览器实玩已到服务端结算，最终截图时浏览器进程崩溃；不将完整自动化UI验收标为通过，详情见 docs/验收记录.md。

## Task 4 微信端与交付

Files: wechat/game.js, wechat/game.json, wechat/project.config.json, wechat/client.js, docs/接入与验收.md, README.md, .env.example。
Consumes: same authenticated REST protocol；Produces: 可导入的微信小游戏及说明。

- [x] 实现Canvas房间、座位、身份、动作、发言、答题与wx.request录音播放适配。
- [x] 用协议契约测试微信客户端请求，不把模拟器当真机测试。
- [x] 独立代码审阅，修复阻断问题并重跑相关完整测试。
- [x] 交付运行路径、检查结果、待配置AppID/公网后端/AI密钥及语音真机测试。
