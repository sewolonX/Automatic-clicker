// ==UserScript==
// @name         Automatic-operation
// @namespace    https://github.com/sewolonX/Automatic-operation
// @version      4.7
// @description  选取元素后自动点击/输入，严格宽松双模式，支持单选、多选、队列模式，跨刷新保存，初始最小化。
// @author       sewolon
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @downloadURL https://sewolon.oss-cn-shanghai.aliyuncs.com/automatic-operation/Automatic-operation.js
// @updateURL https://sewolon.oss-cn-shanghai.aliyuncs.com/automatic-operation/Automatic-operation.js
// ==/UserScript==

(function () {
    'use strict';

    // ========== 持久化存储 ==========
    const STORAGE_KEY = 'AUTO_OP_CONFIG_' + window.location.hostname;

    // ========== 状态变量 ==========
    const DEBUG = false;
    let targets = [];
    let isRunning = false;
    let timerID = null;
    let clickedCount = 0;
    let maxClicks = Infinity;
    let clickInterval = 1100;
    let isPicking = false;
    let isDarkMode = false;
    let autoFillContent = '';
    let isMultiMode = false;
    let clickStrategy = 'simultaneous';
    let currentQueueIndex = 0;
    let waitStartTime = 0;
    let isWaiting = false;
    let waitTimerID = null;
    let originalFocus = HTMLElement.prototype.focus;
    let focusinHandler = null;
    let wakeLock = null;
    let stateTimerID = null;

    // ========== 工具函数 ==========
    async function requestWakeLock() {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            if (DEBUG) console.log('[AUTO_OP] WakeLock 已获取');
        } catch (e) {
            console.error('[AUTO_OP] WakeLock 获取失败:', e);
        }
    }

    async function releaseWakeLock() {
        if (wakeLock) {
            await wakeLock.release();
            wakeLock = null;
            if (DEBUG) console.log('[AUTO_OP] WakeLock 已释放');
        }
    }

    function suppressFocus() {
        if (DEBUG) console.log('[AUTO_OP] suppressFocus 劫持 focus');
        HTMLElement.prototype.focus = function() {
            if (!panel.contains(this)) return;
            originalFocus.apply(this, arguments);
        };
        focusinHandler = function(e) {
            if (!panel.contains(e.target)) e.target.blur();
        };
        document.addEventListener('focusin', focusinHandler, true);
    }

    function restoreFocus() {
        if (DEBUG) console.log('[AUTO_OP] restoreFocus 恢复 focus');
        HTMLElement.prototype.focus = originalFocus;
        if (focusinHandler) {
            document.removeEventListener('focusin', focusinHandler, true);
            focusinHandler = null;
        }
    }

    // ========== 注入样式 ==========
    const style = document.createElement('style');
    style.textContent = `
        :root {
            --panel-bg: #18181b;
            --panel-border: #333;
            --panel-text: #e0e0e0;
            --panel-input-bg: #27272a;
            --panel-input-border: #333;
            --panel-input-text: #e0e0e0;
            --panel-label-text: #888;
            --panel-button-bg: rgba(255,255,255,0.06);
            --panel-button-border: rgba(255,255,255,0.1);
            --panel-button-text: #999;
            --panel-button-hover-bg: rgba(255,255,255,0.12);
            --panel-button-hover-text: #fff;
            --panel-highlight-border: #277AF7;
            --panel-active-border: #22c55e;
            --panel-active-text: #22c55e;
            --panel-waiting-text: #f59e0b;
            --panel-highlight: #f59e0b;
            --panel-selected-highlight: #22c55e;
            --panel-missing-border: #dc2626;
            --panel-missing-text: #dc2626;
            --ac-font: system-ui;
        }
        [data-theme="light"] {
            --panel-bg: #ffffff;
            --panel-border: #e5e7eb;
            --panel-text: #1f2937;
            --panel-input-bg: #f9fafb;
            --panel-input-border: #d1d5db;
            --panel-input-text: #1f2937;
            --panel-label-text: #6b7280;
            --panel-button-bg: rgba(0,0,0,0.05);
            --panel-button-border: rgba(0,0,0,0.1);
            --panel-button-text: #6b7280;
            --panel-button-hover-bg: rgba(0,0,0,0.1);
            --panel-button-hover-text: #1f2937;
            --panel-highlight-border: #3482FF;
            --panel-active-border: #32d486;
            --panel-active-text: #32d486;
            --panel-waiting-text: #d97706;
            --panel-highlight: #d97706;
            --panel-selected-highlight: #32d486;
            --panel-missing-border: #dc2626;
            --panel-missing-text: #dc2626;
            .ac-status { border-top-color: #999; }
            .ac-switch-thumb { background: #ffffff; }
            .ac-switch-track { border-color: #d1d5db; background: #dedede; }

        }
        #ac-panel {
            position: fixed; top: 20px; left: 20px; z-index: 2147483647 !important;
            background: var(--panel-bg); color: var(--panel-text); border: 1px solid var(--panel-border);
            border-radius: 12px; padding: 0; width: 300px; font-size: 13px !important;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5); transition: opacity 0.3s; overflow: hidden;
            display: flex; flex-direction: column; font-variant-numeric: tabular-nums !important;
            text-align: left !important;
        }
        .ac-header {
            position: sticky; top: 0; background: var(--panel-bg); border-bottom: 1px solid var(--panel-border);
            padding: 14px 14px 14px 14px; cursor: move; min-height: 44px; touch-action: none;
            z-index: 1; display: flex; align-items: center; flex-shrink: 0;
        }
        .ac-header h3 {
            margin: 0; font-size: 15px; font-weight: 800; font-family: inherit; color: var(--panel-text);
            display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; white-space: nowrap; flex: 1;
        }
        .ac-toggle {
            flex-shrink: 0; width: 30px; height: 30px; background: var(--panel-button-bg);
            border: 1px solid var(--panel-button-border); color: var(--panel-button-text);
            font-size: 18px; font-family: var(--ac-font); cursor: pointer; display: flex; align-items: center;
            justify-content: center; padding: 0; border-radius: 6px; margin-right: 12px; line-height: 1;
            transition: all 0.2s;
            outline: none; -webkit-tap-highlight-color: transparent; user-select: none;
        }
        .ac-toggle:focus-visible {
            outline: 2px solid var(--panel-highlight-border);
            outline-offset: 2px;
        }
        .ac-toggle:hover { background: var(--panel-button-hover-bg); color: var(--panel-button-hover-text); }
        .ac-toggle:active { transform: scale(0.92) !important; }
        .ac-header-start {
            flex-shrink: 0; width: 30px; height: 30px; border: none; color: #fff;
            font-size: 14px; font-family: inherit; cursor: pointer; display: none; /* 默认隐藏 */
            align-items: center; justify-content: center; padding: 0; border-radius: 6px; margin-right: 8px;
            line-height: 0; transition: all 0.2s; background: #16a34a; opacity: 0.9 !important; text-align: center;
        }
        .ac-header-start:hover { background: #22c55e; opacity: 1 !important; }
        .ac-header-start.is-stop { background: #dc2626; opacity: 0.9 !important; }
        .ac-header-start.is-stop:hover { background: #ef4444; opacity: 1 !important; }
        .ac-header-start:active { transform: scale(0.92) !important; }
        .ac-header-start:disabled { opacity: 0.4 !important; cursor: not-allowed; }
        /* 仅在折叠状态显示 */
        #ac-panel.collapsed .ac-header-start { display: flex; }
        .ac-body { padding: 14px 14px 14px; overflow-y: auto; max-height: 55vh; scrollbar-width: none; -ms-overflow-style: none; }
        .ac-body::-webkit-scrollbar { display: none; }
        #ac-panel.collapsed .ac-body { display: none; }
        #ac-panel.collapsed { width: auto; }
        .ac-row { margin-bottom: 12px; min-height: 0px; }
        .ac-row label {
            display: block; font-size: 11px; font-weight: 600; font-family: var(--ac-font); color: var(--panel-label-text);
            margin-bottom: 5px; letter-spacing: 0.5px;
        }
        .ac-row input[type="number"], .ac-row select, .ac-row input[type="text"] {
            width: 100%; background: var(--panel-input-bg) !important; border: 1px solid var(--panel-input-border) !important;
            border-radius: 6px; color: var(--panel-input-text) !important; padding: 7px 10px; font-size: 13px;
            font-family: var(--ac-font); outline: none; box-sizing: border-box; -webkit-appearance: none;
        }
        .ac-row input[type="number"]:focus, .ac-row select:focus, .ac-row input[type="text"]:focus {
            border-color: var(--panel-highlight-border);
        }
        .ac-row input[type="number"]::placeholder { color: var(--panel-label-text); }
        .ac-row select option { background: var(--panel-input-bg); color: var(--panel-input-text); }
        .ac-row-switch {
            display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
        }
        .ac-row-switch label {
            margin-bottom: 0; flex: 1; font-size: 11px; font-weight: 600; font-family: var(--ac-font);
            color: var(--panel-label-text); letter-spacing: 0.5px;
        }
        .ac-switch {
            position: relative;
            width: 36px;
            height: 20px;
            flex-shrink: 0;
            flex: 0 0 36px !important;
            -webkit-tap-highlight-color: transparent;
            outline: none;
        }
        .ac-switch input {
            opacity: 0;
            width: 0;
            height: 0;
            position: absolute;
            -webkit-tap-highlight-color: transparent;
            outline: none;
        }
        .ac-switch-track {
            position: absolute;
            inset: 0;
            background: #27272a;
            border: 1px solid var(--panel-input-border);
            border-radius: 10px;
            cursor: pointer;
            transition: background 0.2s, border-color 0.2s;
            display: flex;
            align-items: center;
        }
        .ac-switch-thumb {
            width: 14px;
            height: 14px;
            background: #999;
            border-radius: 50%;
            transition: transform 0.2s, background 0.2s;
            pointer-events: none;
            flex-shrink: 0;
            transform: translateX(3px);
        }
        .ac-switch input:checked + .ac-switch-track {
            background: var(--panel-highlight-border);
            border-color: var(--panel-highlight-border);
        }
        .ac-switch input:checked + .ac-switch-track .ac-switch-thumb {
            transform: translateX(18px);
            background: #fff;
        }
        .ac-target-list-container { min-height: 0px; }
        .ac-target-info {
            background: var(--panel-input-bg); border: 1px solid var(--panel-input-border);
            border-radius: 6px; padding: 8px 10px; font-size: 12px; font-weight: 600; font-family: var(--ac-font);
            color: var(--panel-label-text); word-break: break-all; line-height: 1.5;
        }
        .ac-target-list {
            max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; scrollbar-width: none; -ms-overflow-style: none; }
        .ac-target-list::-webkit-scrollbar { display: none; }
        .ac-target-item {
            background: var(--panel-input-bg); border: 1px solid var(--panel-input-border);
            border-radius: 6px; padding: 8px 10px; font-size: 12px; font-family: var(--ac-font);
            color: var(--panel-highlight-border); word-break: break-all; line-height: 1.5;
            position: relative; min-height: 54px; max-height: 60px; overflow-y: auto;
            box-sizing: border-box; transition: border-color 0s, color 0s;
             scrollbar-width: none; -ms-overflow-style: none;
             }
        .ac-target-item::-webkit-scrollbar { display: none; }
        .ac-target-item.active { border-color: var(--panel-active-border); color: var(--panel-active-text); }
        .ac-target-item.missing { border-color: var(--panel-missing-border); color: var(--panel-missing-text); }
        .ac-target-item span { display: block; padding-right: 20px; white-space: pre-wrap; font-weight: 600; }
        .ac-match-mode {
            position: absolute !important; right: 24px !important; top: 4px !important; width: 42px !important; height: 16px !important;
            font-size: 10px !important; font-weight: 500 !important; font-family: var(--ac-font) !important; padding: 0px 4px !important;
            background: var(--panel-input-bg) !important; border: 1px solid var(--panel-input-border)!important;
            color: var(--panel-input-text) !important; border-radius: 4px !important; opacity: 0.8 !important;
        }
        .ac-btn-item-del {
            position: absolute; top: 4px; right: 4px; width: 16px; height: 16px;
            background: var(--panel-button-bg); border: 1px solid var(--panel-button-border);
            color: var(--panel-button-text); font-size: 10px; font-family: var(--ac-font);
            line-height: 14px; text-align: center; border-radius: 4px; cursor: pointer; padding: 0;
            transition: all 0.2s;
        }
        .ac-btn-item-del:hover { background: #dc2626; color: #fff; border-color: #dc2626; }
        .ac-btn-group { display: flex; gap: 8px; margin-top: 14px; }
        .ac-btn {
            flex: 1; padding: 9px 0; border: none; border-radius: 6px; font-size: 13px;
            font-weight: 600; font-family: var(--ac-font); cursor: pointer; transition: all 0.2s;
        }
        .ac-btn:active { transform: scale(0.96) !important; }
        .ac-btn-pick { background: var(--panel-button-bg); color: var(--panel-button-text); }
        .ac-btn-pick:hover { background: var(--panel-button-hover-bg); color: var(--panel-button-hover-text); }
        .ac-btn-pick.picking { background: #f59e0b; color: #000; animation: ac-pulse 1s infinite !important; }
        .ac-btn-pick:disabled, .ac-btn-start:disabled { opacity: 0.4; cursor: not-allowed; }
        .ac-btn-start { background: #16a34a; color: #fff; }
        .ac-btn-start:hover { background: #22c55e; }
        .ac-btn-stop { background: #dc2626; color: #fff; }
        .ac-btn-stop:hover { background: #ef4444; }
        .ac-status {
            margin-top: 12px; padding-top: 12px; border-top: 1px solid #888; font-size: 12px; font-weight: 600;
            font-family: var(--ac-font); color: var(--panel-label-text); display: flex;
            justify-content: space-between; align-items: center;
        }
        .ac-status .ac-count { color: var(--panel-highlight-border); font-size: 14px; font-family: var(--ac-font); }
        .ac-status.running .ac-count { animation: ac-pulse 0.8s infinite !important; }
        .ac-status .ac-waiting { color: var(--panel-waiting-text); font-size: 11px; font-family: var(--ac-font); }
        .ac-highlight { outline: 2px dashed var(--panel-highlight) !important; outline-offset: 2px !important; cursor: crosshair !important; }
        .ac-selected-highlight { outline: 2px solid var(--panel-selected-highlight) !important; outline-offset: 2px !important; }
        .ac-btn-cancel {
            flex-shrink: 0; padding: 0px; font-size: 11px; font-family: var(--ac-font);
            background: var(--panel-button-bg); border: 1px solid var(--panel-button-border);
            color: var(--panel-button-text); border-radius: 4px; cursor: pointer;
            white-space: nowrap; max-width: 35px;  max-height: 16px
            display: inline-flex; align-items: center; justify-content: center;
        }
        .ac-btn-cancel:hover { background: var(--panel-button-hover-bg); color: var(--panel-button-hover-text); }
        .ac-target-count { font-size: 11px; font-weight: 600; font-family: var(--ac-font); margin-left: 6px; display: inline-flex; align-items: center; }
        .ac-target-count-exist { color: var(--panel-active-text); }
        .ac-target-count-missing { color: var(--panel-missing-text); }
        .ac-target-count-total { color: var(--panel-highlight-border); }
        @keyframes ac-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    `;
    document.head.appendChild(style);

    // ========== 检测浏览器主题并设置初始模式 ==========
    function detectBrowserTheme() {
        const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        isDarkMode = darkModeMediaQuery.matches;
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        darkModeMediaQuery.addEventListener('change', (e) => {
            isDarkMode = e.matches;
            document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        });
    }

    // ========== 创建面板 ==========
    const panel = document.createElement('div');
    panel.id = 'ac-panel';
    panel.innerHTML = `
        <div class="ac-header">
            <button class="ac-toggle" title="收起/展开">−</button>
            <button class="ac-header-start" id="ac-btn-header-start" title="开始/停止">▶</button>
            <h3>自动操作 ⚔</h3>
        </div>
        <div class="ac-body">
            <div class="ac-row-switch">
                <label>多选模式</label>
                <label class="ac-switch">
                    <input type="checkbox" id="ac-multi-mode">
                    <span class="ac-switch-track">
                        <span class="ac-switch-thumb"></span>
                    </span>
                </label>
            </div>
            <div class="ac-row" id="ac-strategy-row" style="display: none">
                <label>操作策略</label>
                <select id="ac-click-strategy">
                    <option value="simultaneous">同时操作（0ms队列）</option>
                    <option value="sequential">队列操作</option>
                </select>
            </div>
            <div class="ac-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <label style="margin-bottom: 0;">目标元素</label>
                <span id="ac-target-count" class="ac-target-count"></span>
                <span style="flex: 1;"></span>
                <button class="ac-btn ac-btn-cancel" id="ac-btn-clear-all" style="display: none;">清空</button>
            </div>
            <div class="ac-row" style="margin-top: 0;">
                <div class="ac-target-list-container" id="ac-target-list-container">
                    <div class="ac-target-info">未选取，请点击下方按钮选取</div>
                </div>
            </div>
            <div class="ac-row" id="ac-auto-fill-row" style="display: none;">
                <label>自动填充内容</label>
                <input type="text" id="ac-auto-fill" placeholder="输入内容（留空为点击）">
            </div>
            <div class="ac-row">
                <label>操作次数</label>
                <input type="number" id="ac-max-clicks" min="0" placeholder="留空为无限">
            </div>
            <div class="ac-row">
                <label>操作间隔（ms）</label>
                <input type="number" id="ac-click-interval" min="1" placeholder="1100" value="1100">
            </div>
            <div class="ac-row">
                <label>元素消失后</label>
                <select id="ac-missing-action">
                    <option value="wait">等待重试（自动继续）</option>
                    <option value="stop">立即停止</option>
                </select>
            </div>
            <div class="ac-btn-group">
                <button class="ac-btn ac-btn-pick" id="ac-btn-pick">选取元素</button>
                <button class="ac-btn ac-btn-start" id="ac-btn-start" disabled>开始</button>
            </div>
            <div class="ac-status" id="ac-status">
                <span>已操作：<span class="ac-count" id="ac-count">0</span> 次</span>
                <span id="ac-state">请选取目标元素</span>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    // 获取 DOM 引用
    const targetListContainer = document.getElementById('ac-target-list-container');
    const autoFillInput = document.getElementById('ac-auto-fill');
    const maxClicksInput = document.getElementById('ac-max-clicks');
    const clickIntervalInput = document.getElementById('ac-click-interval');
    const missingActionSelect = document.getElementById('ac-missing-action');
    const btnPick = document.getElementById('ac-btn-pick');
    const btnStart = document.getElementById('ac-btn-start');
    const statusDiv = document.getElementById('ac-status');
    const countSpan = document.getElementById('ac-count');
    const stateSpan = document.getElementById('ac-state');
    const toggleBtn = panel.querySelector('.ac-toggle');
    const dragHandle = panel.querySelector('.ac-header');
    const btnClearAll = document.getElementById('ac-btn-clear-all');
    const targetCountSpan = document.getElementById('ac-target-count');
    const multiModeCheckbox = document.getElementById('ac-multi-mode');
    const strategyRow = document.getElementById('ac-strategy-row');
    const strategySelect = document.getElementById('ac-click-strategy');
    const btnHeaderStart = document.getElementById('ac-btn-header-start');

    detectBrowserTheme();

    // ========== 初始最小化 ==========
    panel.classList.add('collapsed');
    toggleBtn.textContent = '+';
    if (window.innerWidth < 500) {
        panel.style.left = Math.max(10, (window.innerWidth - 300) / 2) + 'px';
        panel.style.top = '10px';
        panel.style.right = 'auto';
    }

    // ========== 元素查找与指纹工具 ==========
    function buildBaseSelector(el) {
        if (el.id) return '#' + CSS.escape(el.id);
        let sel = el.tagName.toLowerCase();
        if (el.className && typeof el.className === 'string') {
            const cls = el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('ac-')).map(c => '.' + CSS.escape(c)).join('');
            if (cls) sel += cls;
        }
        return sel;
    }

    function buildSelectors(el) {
        const base = buildBaseSelector(el);
        if (el.id) return { strict: base, loose: base };
        let strict = base;
        const parent = el.parentElement;
        if (parent) {
            try {
                const sameTagSiblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
                if (sameTagSiblings.length > 1) strict += ':nth-of-type(' + (sameTagSiblings.indexOf(el) + 1) + ')';
            } catch (e) {}
        }
        return { strict: strict, loose: base };
    }

    // ========== 公共文本提取函数（生成指纹和面板显示） ==========
    function getElText(el) {
        let text = (el.textContent || '').trim();
        if (!text) {
            const visualAttrs = ['alt', 'title', 'placeholder', 'aria-label', 'value'];
            for (const attr of visualAttrs) {
                const val = el.getAttribute(attr);
                if (val && val.trim() && val.trim().length < 50) { text = val.trim(); break; }
            }
        }
        if (!text && el.children.length > 0) {
            for (const child of el.children) {
                const cText = (child.textContent || '').trim();
                if (cText) { text = cText; break; }
                for (const attr of ['alt', 'title']) {
                    const val = child.getAttribute(attr);
                    if (val && val.trim()) { text = val.trim(); break; }
                }
                if (text) break;
            }
        }
        if (!text) {
            try {
                const pseudoElems = ['::before', '::after'];
                for (const pseudo of pseudoElems) {
                    const style = window.getComputedStyle(el, pseudo);
                    let content = style.getPropertyValue('content');
                    if (content && content !== 'none' && content !== 'normal' && content !== '""') {
                        content = content.replace(/^"|"$/g, '').replace(/^'|'$/g, '').trim();
                        if (content && !(content.length <= 2 && /[\uE000-\uF8FF]/.test(content))) { text = content; break; }
                    }
                }
            } catch(e) {}
        }
        if (DEBUG) console.log('[AUTO_OP] getElText 结果:', text || '(空)', 'el:', el.tagName, el.id);
        return text;
    }

    function getElementFingerprint(el) {
        const dataAttrs = {}, attrs = {};
        const keyAttrs = ['href', 'src', 'value', 'type', 'name', 'role', 'alt', 'title', 'placeholder', 'action', 'method', 'onclick'];
        Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith('data-')) dataAttrs[attr.name] = attr.value;
            else if (keyAttrs.includes(attr.name)) attrs[attr.name] = attr.value;
        });
        let onclickParam = '';
        if (attrs.onclick) {
            const match = attrs.onclick.match(/useItem\((\d+)\)/);
            if (match) onclickParam = match[1];
        }
        let text = getElText(el);
        const result = {
            tagName: el.tagName.toLowerCase(), text: text, dataAttrs, attrs, onclickParam,
            hasStrong: !!el.id || Object.keys(dataAttrs).length > 0 || keyAttrs.some(k => attrs[k])
        };
        if (DEBUG) console.log('[AUTO_OP] getElementFingerprint:', result);
        return result;
    }

    function matchesFingerprint(el, fp, matchMode) {
        if (DEBUG) console.log('[AUTO_OP] matchesFingerprint 开始 matchMode:', matchMode, 'el:', el.tagName, 'fp.tagName:', fp.tagName);
        if (!el || el.tagName.toLowerCase() !== fp.tagName) { if (DEBUG) console.log('[AUTO_OP] matchesFingerprint 标名不匹配, return false'); return false; }
        if (matchMode === 'strict') {
            for (const [k, v] of Object.entries(fp.dataAttrs)) { if (el.getAttribute(k) !== v) { if (DEBUG) console.log('[AUTO_OP] 严格模式 dataAttr 不匹配:', k, '期望:', v, '实际:', el.getAttribute(k)); return false; } }
            for (const [k, v] of Object.entries(fp.attrs)) { if (v && el.getAttribute(k) !== v) { if (DEBUG) console.log('[AUTO_OP] 严格模式 attrs 不匹配:', k, '期望:', v, '实际:', el.getAttribute(k)); return false; } }
            if (fp.onclickParam) {
                const m = (el.getAttribute('onclick') || '').match(/useItem\((\d+)\)/);
                if (m && m[1] !== fp.onclickParam) { if (DEBUG) console.log('[AUTO_OP] 严格模式 onclickParam 不匹配, 期望:', fp.onclickParam, '实际:', m[1]); return false; }
            }
            if (fp.text) {
                let elText;
                if (fp.hasStrong) {
                    elText = (el.textContent || '').trim();
                    if (!elText) {
                        const visualAttrs = ['alt', 'title', 'placeholder', 'aria-label', 'value'];
                        for (const attr of visualAttrs) { const val = el.getAttribute(attr); if (val && val.trim()) { elText = val.trim(); break; } }
                    }
                } else { elText = getElText(el); }
                if (elText !== fp.text) { if (DEBUG) console.log('[AUTO_OP] 严格模式 text 不匹配, 期望:', fp.text, '实际:', elText); return false; }
            }
            if (DEBUG) console.log('[AUTO_OP] 严格模式 匹配成功');
            return true;
        } else {
            if (fp.text) {
                let elText = (el.textContent || '').trim();
                if (!elText) {
                    const visualAttrs = ['alt', 'title', 'placeholder', 'aria-label', 'value'];
                    for (const attr of visualAttrs) { const val = el.getAttribute(attr); if (val && val.trim()) { elText = val.trim(); break; } }
                }
                if (!elText) elText = getElText(el);
                if (elText !== fp.text) { if (DEBUG) console.log('[AUTO_OP] 宽松模式 text 不匹配, 期望:', fp.text, '实际:', elText); return false; }
            } else {
                if (!(el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) { if (DEBUG) console.log('[AUTO_OP] 宽松模式 无文本 且不是输入元素, 不匹配'); return false; }
            }
        }
        if (DEBUG) console.log('[AUTO_OP] 宽松模式 匹配成功');
        return true;
    }

    function tryFindTarget(targetObj) {
        if (!targetObj || !targetObj.fingerprint) return null;
        const fp = targetObj.fingerprint;
        if (DEBUG) console.log('[AUTO_OP] tryFindTarget 开始查找 strict:', targetObj.strict, 'loose:', targetObj.loose, 'matchMode:', targetObj.matchMode);
        function verifyList(list) {
            const matched = [];
            if (DEBUG) console.log('[AUTO_OP] verifyList 候选元素数:', list.length);
            for (const el of list) {
                if (panel.contains(el)) { if (DEBUG) console.log('[AUTO_OP] verifyList 跳过面板内元素:', el.tagName); continue; }
                if (targets.some(t => t !== targetObj && t.element === el)) { if (DEBUG) console.log('[AUTO_OP] verifyList 跳过已被占用元素:', el.tagName); continue; }
                if (matchesFingerprint(el, fp, targetObj.matchMode)) {
                    matched.push(el);
                    if (DEBUG) console.log('[AUTO_OP] verifyList 匹配成功:', el.tagName, el.id);
                } else {
                    if (DEBUG) console.log('[AUTO_OP] verifyList 匹配失败:', el.tagName, el.id);
                }
            }
            if (DEBUG) console.log('[AUTO_OP] verifyList 最终匹配数:', matched.length);
            return matched.length > 0 ? matched : null;
        }
        try {
            if (targetObj.strict) {
                const queryResult = document.querySelectorAll(targetObj.strict); if (DEBUG) console.log('[AUTO_OP] strict 选择器查询:', targetObj.strict, '结果数:', queryResult.length);
                const found = verifyList(queryResult);
                if (found) { if (DEBUG) console.log('[AUTO_OP] strict 匹配成功, 数量:', found.length); return found; }
            }
            if (targetObj.loose) {
                const queryResult = document.querySelectorAll(targetObj.loose); if (DEBUG) console.log('[AUTO_OP] loose 选择器查询:', targetObj.loose, '结果数:', queryResult.length);
                const found = verifyList(queryResult);
                if (found) { if (DEBUG) console.log('[AUTO_OP] loose 匹配成功, 数量:', found.length); return found; }
            }
            const found = verifyList(document.querySelectorAll(fp.tagName));
            if (found) { if (DEBUG) console.log('[AUTO_OP] tagName 匹配成功, 数量:', found.length); return found; }
        } catch (e) { console.error('[AUTO_OP] tryFindTarget 异常:', e); }
        if (DEBUG) console.log('[AUTO_OP] tryFindTarget 未找到任何匹配元素');
        return null;
    }

    // ========== 运行时发现新匹配元素 ==========
    function discoverNewTargets() {
        if (targets.length === 0) return;

        const existingElements = new Set();
        for (const t of targets) {
            if (t.element && document.contains(t.element)) {
                existingElements.add(t.element);
            }
        }

        const newTargets = [];
        const seenSelectors = new Set();

        for (const t of targets) {
            const selector = t.loose || t.strict;
            if (seenSelectors.has(selector)) continue;
            seenSelectors.add(selector);

            let candidates;
            try {
                candidates = document.querySelectorAll(selector);
            } catch (e) {
                candidates = [];
            }

            if (candidates.length === 0) {
                try {
                    candidates = document.querySelectorAll(t.fingerprint.tagName);
                } catch (e) {
                    candidates = [];
                }
            }

            for (const el of candidates) {
                if (panel.contains(el)) continue;
                if (existingElements.has(el)) continue;
                if (!matchesFingerprint(el, t.fingerprint, t.matchMode)) continue;

                existingElements.add(el);
                el.classList.add('ac-selected-highlight');
                newTargets.push({
                    element: el,
                    strict: t.strict,
                    loose: t.loose,
                    fingerprint: t.fingerprint,
                    desc: t.desc,
                    isInput: t.isInput,
                    matchMode: t.matchMode
                });
            }
        }

        if (newTargets.length > 0) {
            targets.push(...newTargets);
            if (DEBUG) console.log('[AUTO_OP] discoverNewTargets 新增:', newTargets.length, '个');
        }
    }

    // ========== 持久化函数 ==========
    function saveData() {
        if (DEBUG) console.log('[AUTO_OP] saveData 保存配置, targets 数量:', targets.length);
        const toSave = {
            isMultiMode, clickStrategy,
            clickInterval: parseInt(clickIntervalInput.value) || 1100,
            maxClicks: maxClicksInput.value,
            missingAction: missingActionSelect.value,
            autoFillContent: autoFillInput.value,
            targets: targets.map(t => ({
                strict: t.strict, loose: t.loose, fingerprint: t.fingerprint,
                desc: t.desc, isInput: t.isInput, matchMode: t.matchMode
            }))
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        if (DEBUG) console.log('[AUTO_OP] saveData 保存完成, key:', STORAGE_KEY);
    }

    function loadData() {
        if (DEBUG) console.log('[AUTO_OP] loadData 开始, STORAGE_KEY:', STORAGE_KEY);
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        try {
            const cfg = JSON.parse(saved);
            if (DEBUG) console.log('[AUTO_OP] 加载配置:', cfg);
            isMultiMode = cfg.isMultiMode || false;
            multiModeCheckbox.checked = isMultiMode;
            strategyRow.style.display = isMultiMode ? 'block' : 'none';
            clickStrategy = cfg.clickStrategy || 'simultaneous';
            strategySelect.value = clickStrategy;
            clickInterval = cfg.clickInterval || 1100;
            clickIntervalInput.value = clickInterval;
            maxClicksInput.value = cfg.maxClicks || '';
            missingActionSelect.value = cfg.missingAction || 'wait';
            autoFillContent = cfg.autoFillContent || '';
            autoFillInput.value = autoFillContent;

            targets = [];
            (cfg.targets || []).forEach(t => {
                if (DEBUG) console.log('[AUTO_OP] 恢复目标 desc:', t.desc, 'strict:', t.strict, 'loose:', t.loose);
                const base = {
                    strict: t.strict,
                    loose: t.loose,
                    fingerprint: t.fingerprint,
                    desc: t.desc,
                    isInput: !!t.isInput,
                    matchMode: t.matchMode || 'strict'
                };
                const found = tryFindTarget({ ...base, element: null });
                if (DEBUG) console.log('[AUTO_OP] 查找结果:', found ? found.length + '个' : '未找到', 'desc:', t.desc);
                if (found && found.length > 0) {
                    found.forEach(el => {
                        const obj = { ...base, element: el };
                        el.classList.add('ac-selected-highlight');
                        targets.push(obj);
                    });
                } else {
                    targets.push({ ...base, element: null });
                    if (DEBUG) console.log('[AUTO_OP] loadData 未找到, element 设为 null, desc:', t.desc);
                }
            });
            if (DEBUG) console.log('[AUTO_OP] loadData 完成, targets 总数:', targets.length);
            updateTargetUI();
            updateTargetCount();
            updateAutoFillVisibility();
            if (targets.length > 0) { stateSpan.textContent = '就绪'; }
        } catch (e) { console.error("[AUTO_OP] loadData 异常:", e); }
    }

    // ========== UI 更新 ==========
    function updateTargetUI() {
        if (DEBUG) console.log('[AUTO_OP] updateTargetUI targets 数量:', targets.length);
        if (targets.length === 0) {
            targetListContainer.innerHTML = '<div class="ac-target-info">未选取，请点击下方按钮选取</div>';
            btnClearAll.style.display = 'none';
            btnStart.disabled = true;
            btnHeaderStart.disabled = true;
            if (DEBUG) console.log('[AUTO_OP] updateTargetUI 空列表, 禁用按钮');
            return;
        }
        btnClearAll.style.display = 'inline-block';
        btnStart.disabled = false;
        btnHeaderStart.disabled = false;
        let html = '<div class="ac-target-list">';
        targets.forEach((t, i) => {
            html += `<div class="ac-target-item active" data-index="${i}">
                <span>${isMultiMode ? (i + 1) + '. ' : ''}${t.desc}</span>
                <select class="ac-match-mode" data-index="${i}">
                    <option value="strict" ${t.matchMode === 'strict' ? 'selected' : ''}>严格</option>
                    <option value="text" ${t.matchMode === 'loose' ? 'selected' : ''}>宽松</option>
                </select>
                <button class="ac-btn-item-del" onclick="window._acRemoveTarget(${i})">✕</button>
            </div>`;
        });
        html += '</div>';
        targetListContainer.innerHTML = html;

        document.querySelectorAll('.ac-match-mode').forEach(select => {
            select.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                if (targets[index]) {
                    targets[index].matchMode = e.target.value;
                    saveData();
                }
            });
        });
        updateTargetCount();
        if (DEBUG) console.log('[AUTO_OP] updateTargetUI 渲染完成');
    }

    // ========== 自动填充行显隐控制 ==========
    function updateAutoFillVisibility() {
        const autoFillRow = document.getElementById('ac-auto-fill-row');
        if (!autoFillRow) return;
        const hasInputTarget = targets.some(t => t.isInput);
        if (DEBUG) console.log('[AUTO_OP] updateAutoFillVisibility hasInputTarget:', hasInputTarget);
        autoFillRow.style.display = hasInputTarget ? 'block' : 'none';
    }

    function updateTargetCount(status) {
        if (!status) {
            let existCount = 0;
            let missingCount = 0;
            let total = targets.length;
            targets.forEach(t => {
                let el = t.element;
                let isValid = el && document.contains(el) && matchesFingerprint(el, t.fingerprint, t.matchMode);
                if (isValid) existCount++;
                else missingCount++;
            });
            targetCountSpan.innerHTML =
                '[<span class="ac-target-count-exist">' + existCount + '</span>' +
                '/' +
                '<span class="ac-target-count-missing">' + missingCount + '</span>' +
                '/' +
                '<span class="ac-target-count-total">' + total + '</span>]';
            return;
        }
        let existCount = status.filter(Boolean).length;
        let missingCount = status.length - existCount;
        let total = targets.length;
        targetCountSpan.innerHTML =
            '[<span class="ac-target-count-exist">' + existCount + '</span>' +
            '/' +
            '<span class="ac-target-count-missing">' + missingCount + '</span>' +
            '/' +
            '<span class="ac-target-count-total">' + total + '</span>]';
    }

    function updateTargetItemStyle(index, isMissing) {
        const item = targetListContainer.querySelector(`.ac-target-item[data-index="${index}"]`);
        if (!item) return;
        if (isMissing) { item.classList.remove('active'); item.classList.add('missing'); }
        else { item.classList.remove('missing'); item.classList.add('active'); }
    }

    window._acRemoveTarget = function(index) {
        if (DEBUG) console.log('[AUTO_OP] _acRemoveTarget 删除目标元素:', index, 'desc:', targets[index] ? targets[index].desc : '未知');
        if (targets[index]) {
            if (targets[index].element && targets[index].element.classList) {
                targets[index].element.classList.remove('ac-selected-highlight');
            }
            targets.splice(index, 1);
            if (currentQueueIndex >= targets.length) currentQueueIndex = 0;
            updateTargetUI();
            updateTargetCount();
            if (targets.length === 0) {
                stateSpan.textContent = '目标元素已清空';
                if (stateTimerID) { clearTimeout(stateTimerID); stateTimerID = null; }
                stateTimerID = setTimeout(() => {
                    if (stateSpan.textContent === '目标元素已清空') {
                        stateSpan.textContent = '请选取目标元素';
                    }
                    stateTimerID = null;
                }, 1000);
            } else {
                stateSpan.textContent = `剩余 ${targets.length} 个`;
            }
            saveData();
            updateAutoFillVisibility();
        }
        if (DEBUG) console.log('[AUTO_OP] _acRemoveTarget 删除完成, 剩余:', targets.length);
    };

    // ========== 拖拽逻辑 ==========
    let isDragging = false, dragOffX = 0, dragOffY = 0;
    function getEventPos(e) { return e.touches && e.touches.length > 0 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY }; }
    function onDragStart(e) {
        if (e.target === toggleBtn || toggleBtn.contains(e.target)) return;
        if (e.target === btnHeaderStart || btnHeaderStart.contains(e.target)) return;
        isDragging = true;
        const pos = getEventPos(e);
        const rect = panel.getBoundingClientRect();
        dragOffX = pos.x - rect.left; dragOffY = pos.y - rect.top;
        e.preventDefault();
    }
    function onDragMove(e) {
        if (!isDragging) return;
        const pos = getEventPos(e);
        panel.style.left = (pos.x - dragOffX) + 'px';
        panel.style.top = (pos.y - dragOffY) + 'px';
        panel.style.right = 'auto';
        e.preventDefault();
    }
    function onDragEnd() { isDragging = false; }
    dragHandle.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    dragHandle.addEventListener('touchstart', onDragStart, { passive: false });
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend', onDragEnd);
    document.addEventListener('touchcancel', onDragEnd);

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('collapsed');
        toggleBtn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
        if (DEBUG) console.log('[AUTO_OP] 面板折叠切换:', panel.classList.contains('collapsed') ? '折叠' : '展开');
    });

    // ========== 交互事件 ==========
    multiModeCheckbox.addEventListener('change', (e) => {
        isMultiMode = e.target.checked;
        if (DEBUG) console.log('[AUTO_OP] 多选模式切换:', isMultiMode);
        strategyRow.style.display = isMultiMode ? 'block' : 'none';
        clickStrategy = strategySelect.value;
        clearSelection();
        saveData();
    });
    strategySelect.addEventListener('change', (e) => { clickStrategy = e.target.value; if (DEBUG) console.log('[AUTO_OP] 操作策略切换:', clickStrategy); saveData(); });
    autoFillInput.addEventListener('input', (e) => { autoFillContent = e.target.value; saveData(); });
    [clickIntervalInput, maxClicksInput, missingActionSelect].forEach(el => { el.addEventListener('change', saveData); });

    btnPick.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isRunning) return;
        isPicking = !isPicking;
        if (DEBUG) console.log('[AUTO_OP] btnPick 切换选取模式:', isPicking ? '进入' : '退出');
        if (isPicking) {
            btnPick.textContent = '取消选取';
            btnPick.classList.add('picking');
            stateSpan.textContent = isMultiMode ? '请依次点击多个目标元素' : '请点击目标元素';
            stateSpan.classList.remove('ac-waiting');
            document.addEventListener('mouseover', onPickHover, true);
            document.addEventListener('mouseout', onPickHoverOut, true);
            document.addEventListener('click', onPickClick, true);
            document.addEventListener('touchend', onPickTouch, true);
        } else { exitPickMode(); }
    });

    function onPickHover(e) { if (!isPicking) return; const el = e.target; if (panel.contains(el)) return; el.classList.add('ac-highlight'); }
    function onPickHoverOut(e) { e.target.classList.remove('ac-highlight'); }
    function onPickTouch(e) {
        if (!isPicking || isDragging) return;
        const touch = e.changedTouches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!el || panel.contains(el)) return;
        e.preventDefault(); e.stopPropagation();
        selectTarget(el);
    }
    function onPickClick(e) {
        if (!isPicking) return;
        const el = e.target;
        if (panel.contains(el)) return;
        e.preventDefault(); e.stopPropagation();
        selectTarget(el);
    }

    function selectTarget(el) {
        if (DEBUG) console.log('[AUTO_OP] selectTarget 选中元素:', el.tagName, el.id, el.className);
        if (stateTimerID) { clearTimeout(stateTimerID); stateTimerID = null; }
        el.classList.remove('ac-highlight');
        if (targets.some(t => t.element === el) && isMultiMode) { if (DEBUG) console.log('[AUTO_OP] selectTarget 元素已选过, 退出选取'); exitPickMode(); return; }
        const sels = buildSelectors(el);
        const fp = getElementFingerprint(el);
        let desc = el.tagName.toLowerCase();
        if (el.id) desc += '#' + el.id;
        if (el.className && typeof el.className === 'string') {
            const cls = el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('ac-')).slice(0, 5).join('.');
            if (cls) desc += '.' + cls;
        }
        const text = getElText(el);
        if (text) desc += ' "' + text + '"';
        const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
        if (isInput) desc += ' (可输入)';
        if (DEBUG) console.log('[AUTO_OP] selectTarget desc:', desc, 'isInput:', isInput, '选择器:', sels);
        const targetObj = { element: el, strict: sels.strict, loose: sels.loose, fingerprint: fp, desc, isInput, matchMode: isInput ? 'loose' : 'strict' };
        if (DEBUG) console.log('[AUTO_OP] 指纹:', fp, '选择器:', sels, 'desc:', desc, 'isInput:', isInput);
        if (isMultiMode) {
            targets.push(targetObj);
            if (DEBUG) console.log('[AUTO_OP] 多选模式, 当前共:', targets.length, '个目标');
            el.classList.add('ac-selected-highlight');
            stateSpan.textContent = `已选 ${targets.length} 个，继续选取或取消`;
        } else {
            if (DEBUG) console.log('[AUTO_OP] 单选模式, 替换为新目标');
            targets.forEach(t => { if (t.element) t.element.classList.remove('ac-selected-highlight'); });
            targets = [targetObj];
            el.classList.add('ac-selected-highlight');
            exitPickMode();
            if (targets.length > 0) { stateSpan.textContent = '就绪'; }
        }
        updateTargetUI();
        updateTargetCount();
        saveData();
        updateAutoFillVisibility();
    }

    function exitPickMode() {
        isPicking = false;
        btnPick.textContent = '选取元素';
        btnPick.classList.remove('picking');
        document.removeEventListener('mouseover', onPickHover, true);
        document.removeEventListener('mouseout', onPickHoverOut, true);
        document.removeEventListener('click', onPickClick, true);
        document.removeEventListener('touchend', onPickTouch, true);
        document.querySelectorAll('.ac-highlight').forEach(el => el.classList.remove('ac-highlight'));
        if (isMultiMode) {
            if (targets.length === 0) { stateSpan.textContent = '未选取目标元素'; }
            else { stateSpan.textContent = `已选 ${targets.length} 个`; }
        } else {
            if (targets.length === 0) { stateSpan.textContent = '未选取目标元素'; }
            else { stateSpan.textContent = '就绪'; }
        }
        if (targets.length === 0) {
            if (stateTimerID) { clearTimeout(stateTimerID); stateTimerID = null; }
            stateTimerID = setTimeout(() => {
                if (stateSpan.textContent === '未选取目标元素') { stateSpan.textContent = '请选取目标元素'; }
                stateTimerID = null;
            }, 1500);
        }
    }

    function clearSelection() {
        if (DEBUG) console.log('[AUTO_OP] clearSelection 清空, 当前:', targets.length, '个');
        targets.forEach(t => {
            if (t.element && t.element.classList) t.element.classList.remove('ac-selected-highlight');
        });
        targets = [];
        currentQueueIndex = 0;
        updateTargetUI();
        updateTargetCount();
        stateSpan.textContent = '目标元素已清空';
        if (stateTimerID) { clearTimeout(stateTimerID); stateTimerID = null; }
        stateTimerID = setTimeout(() => {
            if (stateSpan.textContent === '目标元素已清空') {
                stateSpan.textContent = '请选取目标元素';
            }
            stateTimerID = null;
        }, 1000);
        saveData();
        updateAutoFillVisibility();
        if (DEBUG) console.log('[AUTO_OP] clearSelection 完成');
    }

    btnClearAll.addEventListener('click', (e) => { e.stopPropagation(); clearSelection(); });

    // 统一的开始/停止事件处理函数
    function handleToggleRunning(e) {
        if (DEBUG) console.log('[AUTO_OP] handleToggleRunning isRunning:', isRunning, 'targets:', targets.length);
        e.stopPropagation();
        if (targets.length === 0) return;
        if (!isRunning) { startClicking(); }
        else { stopClicking(); stateSpan.textContent = '已停止'; }
    }
    btnStart.addEventListener('click', handleToggleRunning);
    btnHeaderStart.addEventListener('click', handleToggleRunning);

    function startClicking() {
        if (DEBUG) console.log('[AUTO_OP] startClicking 开始, targets 数量:', targets.length);
        if (stateTimerID) { clearTimeout(stateTimerID); stateTimerID = null; }
        if (isPicking) exitPickMode();
        isWaiting = false;
        if (waitTimerID) { clearTimeout(waitTimerID); waitTimerID = null; }

        for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            if (!t.element || !document.contains(t.element)) {
                const found = tryFindTarget(t);
                if (found && found.length > 0) {
                    if (t.element && t.element.classList) t.element.classList.remove('ac-selected-highlight');
                    t.element = found[0];
                    found[0].classList.add('ac-selected-highlight');
                }
            }
        }

        discoverNewTargets();

        const intervalValue = clickIntervalInput.value.trim();
        clickInterval = intervalValue ? parseInt(intervalValue, 10) : 1100;
        isRunning = true;
        clickedCount = 0;
        currentQueueIndex = 0;
        countSpan.textContent = '0';
        const val = maxClicksInput.value.trim();
        maxClicks = val === '' ? Infinity : parseInt(val, 10) || Infinity;
        if (DEBUG) console.log('[AUTO_OP] startClicking 参数 clickInterval:', clickInterval, 'maxClicks:', maxClicks === Infinity ? '无限' : maxClicks, 'isMultiMode:', isMultiMode, 'clickStrategy:', clickStrategy);

        btnStart.textContent = '停止';
        btnStart.className = 'ac-btn ac-btn-stop';
        btnHeaderStart.textContent = '■';
        btnHeaderStart.classList.add('is-stop');
        btnPick.disabled = true;
        multiModeCheckbox.disabled = true;
        strategySelect.disabled = true;
        maxClicksInput.disabled = true;
        clickIntervalInput.disabled = true;
        missingActionSelect.disabled = true;
        autoFillInput.disabled = true;
        statusDiv.classList.add('running');
        stateSpan.textContent = '运行中';
        stateSpan.classList.remove('ac-waiting');

        doClick();
        if (DEBUG) console.log('[AUTO_OP] startClicking 首次 doClick 已执行');
        timerID = setInterval(doClick, clickInterval);
        if (DEBUG) console.log('[AUTO_OP] startClicking setInterval 已启动, timerID:', timerID);
        requestWakeLock();
        suppressFocus();
        saveData();
    }

    function startWaitTimer(idx) {
        if (DEBUG) console.log('[AUTO_OP] startWaitTimer 目标[' + idx + '] 开始等待');
        if (waitTimerID) clearTimeout(waitTimerID);
        function update() {
            if (!isWaiting || !isRunning) {
                if (DEBUG) console.log('[AUTO_OP] startWaitTimer 提前终止, isWaiting:', isWaiting, 'isRunning:', isRunning);
                if (waitTimerID) { clearTimeout(waitTimerID); waitTimerID = null; }
                return;
            }
            const maxWait = clickInterval * 2;
            const elapsed = Date.now() - waitStartTime;
            const remaining = maxWait - elapsed;
            if (remaining <= 0) {
                if (DEBUG) console.log('[AUTO_OP] startWaitTimer 超时, 跳过目标[' + idx + '], 下一索引:', (idx + 1) % targets.length);
                isWaiting = false;
                if (waitTimerID) { clearTimeout(waitTimerID); waitTimerID = null; }
                currentQueueIndex = (idx + 1) % targets.length;
                stateSpan.textContent = `队列[${idx + 1}/${targets.length}] 超时跳过`;
                stateSpan.classList.remove('ac-waiting');
                return;
            }
            stateSpan.textContent = `${remaining}ms 队列[${idx + 1}/${targets.length}] 等待元素中`;
            stateSpan.classList.add('ac-waiting');
            waitTimerID = setTimeout(update, 1);
        }
        update();
    }

    function doClick() {
        try {
            if (DEBUG) console.log('[AUTO_OP] doClick 触发, targets:', targets.length, 'clickedCount:', clickedCount, 'currentQueueIndex:', currentQueueIndex);
            if (targets.length === 0) {
                if (DEBUG) console.log('[AUTO_OP] doClick 无目标, 停止');
                stopClicking();
                return;
            }

            discoverNewTargets();

            const status = targets.map((t, i) => {
                let el = t.element;
                let isValid = el && document.contains(el) && matchesFingerprint(el, t.fingerprint, t.matchMode);
                if (DEBUG) console.log('[AUTO_OP] doClick 目标[' + i + '] 状态:', isValid ? '有效' : '无效', 'desc:', t.desc);

                if (!isValid) {
                    const found = tryFindTarget(t);
                    if (found && found.length > 0) {
                        if (t.element && document.contains(t.element)) t.element.classList.remove('ac-selected-highlight');
                        t.element = found[0];
                        found[0].classList.add('ac-selected-highlight');
                        isValid = true;
                        if (DEBUG) console.log('[AUTO_OP] doClick 目标[' + i + '] 重新匹配成功');
                    } else {
                        if (DEBUG) console.log('[AUTO_OP] doClick 目标[' + i + '] 重新匹配无效');
                    }
                }

                updateTargetItemStyle(i, !isValid);
                return isValid;
            });

            const totalCount = targets.length;
            if (DEBUG) console.log('[AUTO_OP] doClick 状态数组:', status.map((s, i) => '[' + i + ']:' + (s ? '有效' : '无效')).join(', '));
            updateTargetCount(status);

            // ========== 队列模式 ==========
            if (isMultiMode && clickStrategy === 'sequential') {
                const idx = currentQueueIndex;

                if (idx >= totalCount) {
                    currentQueueIndex = 0;
                    return;
                }

                if (DEBUG) console.log('[AUTO_OP] doClick 队列模式, 当前索引:', idx, '状态:', status[idx] ? '有效' : '无效');

                if (status[idx]) {
                    if (isWaiting) {
                        if (DEBUG) console.log('[AUTO_OP] doClick 队列目标[' + idx + '] 恢复, 取消等待');
                        isWaiting = false;
                        if (waitTimerID) {
                            clearTimeout(waitTimerID);
                            waitTimerID = null;
                        }
                    }

                    const t = targets[idx];
                    const el = t.element;

                    if (t.isInput && autoFillContent) {
                        if (DEBUG) console.log('[AUTO_OP] doClick 队列输入:', autoFillContent, '到目标[' + idx + ']');
                        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                            el.value = autoFillContent;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        } else if (el.isContentEditable) {
                            el.innerHTML = autoFillContent;
                        }
                    } else {
                        if (DEBUG) console.log('[AUTO_OP] doClick 队列操作目标[' + idx + ']');
                        el.click();
                    }

                    clickedCount++;
                    countSpan.textContent = clickedCount;
                    stateSpan.textContent = `队列[${idx + 1}/${totalCount}]`;
                    stateSpan.classList.remove('ac-waiting');
                    currentQueueIndex = (idx + 1) % totalCount;
                    if (DEBUG) console.log('[AUTO_OP] doClick 队列完成, 已操作:', clickedCount, '下一索引:', currentQueueIndex);

                    if (clickedCount >= maxClicks) {
                        if (DEBUG) console.log('[AUTO_OP] doClick 达到最大次数, 停止');
                        stopClicking();
                        stateSpan.textContent = '已完成';
                    }
                } else {
                    if (DEBUG) console.log('[AUTO_OP] doClick 队列目标[' + idx + '] 无效, missingAction:', missingActionSelect.value);

                    if (missingActionSelect.value === 'stop') {
                        if (DEBUG) console.log('[AUTO_OP] doClick 立即停止');
                        stopClicking();
                        stateSpan.textContent = `队列[${idx + 1}] 元素已消失`;
                        stateSpan.classList.remove('ac-waiting');
                    } else {
                        if (!isWaiting) {
                            if (DEBUG) console.log('[AUTO_OP] doClick 开始等待目标[' + idx + ']');
                            isWaiting = true;
                            waitStartTime = Date.now();
                            startWaitTimer(idx);
                        }
                    }
                }

                return;
            }

            // ========== 同时模式 ==========
            if (DEBUG) console.log('[AUTO_OP] doClick 同时模式');
            let shouldStop = false;
            let anyClicked = false;

            for (let i = 0; i < totalCount; i++) {
                const t = targets[i];

                if (status[i]) {
                    anyClicked = true;
                    const el = t.element;

                    if (t.isInput && autoFillContent) {
                        if (DEBUG) console.log('[AUTO_OP] doClick 同时输入目标[' + i + ']:', autoFillContent);
                        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                            el.value = autoFillContent;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        } else if (el.isContentEditable) {
                            el.innerHTML = autoFillContent;
                        }
                    } else {
                        if (DEBUG) console.log('[AUTO_OP] doClick 同时操作目标[' + i + ']');
                        el.click();
                    }
                } else {
                    if (DEBUG) console.log('[AUTO_OP] doClick 同时模式目标[' + i + '] 无效');
                    if (missingActionSelect.value === 'stop') shouldStop = true;
                }
            }

            if (shouldStop) {
                if (DEBUG) console.log('[AUTO_OP] doClick 同时模式有元素消失, 停止');
                stopClicking();
                stateSpan.textContent = '元素已消失';
                stateSpan.classList.remove('ac-waiting');
                return;
            }

            if (anyClicked) {
                if (DEBUG) console.log('[AUTO_OP] doClick 同时模式完成, 已操作:', clickedCount);
                clickedCount++;
                countSpan.textContent = clickedCount;
                stateSpan.textContent = isMultiMode && clickStrategy === 'simultaneous' ? '同时操作运行中' : '运行中';
                stateSpan.classList.remove('ac-waiting');

                if (clickedCount >= maxClicks) {
                    if (DEBUG) console.log('[AUTO_OP] doClick 达到最大次数, 停止');
                    stopClicking();
                    stateSpan.textContent = '已完成';
                }
            } else {
                if (DEBUG) console.log('[AUTO_OP] doClick 同时模式本轮无任何操作');
            }
        } catch (e) {
            console.error('[AUTO_OP] doClick 异常:', e);
        }
    }

    function stopClicking() {
        if (DEBUG) console.log('[AUTO_OP] stopClicking 被调用, isRunning:', isRunning, 'isWaiting:', isWaiting, 'clickedCount:', clickedCount);
        if (stateTimerID) { clearTimeout(stateTimerID); stateTimerID = null; }
        isRunning = false; isWaiting = false;
        restoreFocus();
        releaseWakeLock();
        if (waitTimerID) { clearTimeout(waitTimerID); waitTimerID = null; }
        clearInterval(timerID); timerID = null;
        btnStart.textContent = '开始'; btnStart.className = 'ac-btn ac-btn-start';
        btnHeaderStart.textContent = '▶'; btnHeaderStart.classList.remove('is-stop');
        btnPick.disabled = false; multiModeCheckbox.disabled = false; strategySelect.disabled = false;
        maxClicksInput.disabled = false; clickIntervalInput.disabled = false;
        missingActionSelect.disabled = false; autoFillInput.disabled = false;
        statusDiv.classList.remove('running'); stateSpan.classList.remove('ac-waiting'); if (targets.length > 0) { stateSpan.textContent = '就绪'; } else { stateSpan.textContent = '请选取目标元素'; }
        if (DEBUG) console.log('[AUTO_OP] stopClicking 完成, 所有定时器已清除');
    }

    panel.addEventListener('click', (e) => { e.stopPropagation(); });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isRunning) {
            requestWakeLock();
        }
    });

    // ========== 初始化加载 ==========
    loadData();
})();