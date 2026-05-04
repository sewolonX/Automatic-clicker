// ==UserScript==
// @name         Automatic-operation
// @namespace    https://github.com/sewolonX/Automatic-operation
// @version      4.8
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
    let uiThrottled = false;

    // ========== 工具函数 ==========
    async function requestWakeLock() {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (e) {
            console.error('[AUTO_OP] WakeLock 获取失败:', e);
        }
    }

    async function releaseWakeLock() {
        if (wakeLock) {
            await wakeLock.release();
            wakeLock = null;
        }
    }

    function suppressFocus() {
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
            box-shadow: 0 0 6px rgba(0,0,0,0.15); transition: opacity 0.3s; overflow: hidden;
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
            position: relative; min-height: 54px; max-height: 80px; overflow-y: auto;
            box-sizing: border-box; transition: border-color 0s, color 0s;
            scrollbar-width: none; -ms-overflow-style: none;
        }
        .ac-target-item::-webkit-scrollbar { display: none; }
        .ac-target-item.active { border-color: var(--panel-active-border); color: var(--panel-active-text); }
        .ac-target-item.missing { border-color: var(--panel-missing-border); color: var(--panel-missing-text); }
        .ac-target-item span { display: block; padding-right: 20px; white-space: pre-wrap; font-weight: 600; }
        .ac-target-parent { display: block; font-size: 11px; font-weight: 600; color: var(--panel-highlight-border); margin-bottom: 2px; }
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
        .ac-parent-highlight { box-shadow: 0 0 0 2px var(--panel-highlight-border) !important; position: relative !important; }
        .ac-btn-cancel {
            flex-shrink: 0; padding: 0px; font-size: 11px; font-family: var(--ac-font);
            background: var(--panel-button-bg); border: 1px solid var(--panel-button-border);
            color: var(--panel-button-text); border-radius: 4px; cursor: pointer;
            white-space: nowrap; max-width: 35px;  max-height: 16px;
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
                <input type="text" id="ac-auto-fill" placeholder="输入内容（留空为清空）">
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

    function isInputField(el) {
        if (!el) return false;
        if (el.isContentEditable) return true;
        if (el.tagName === 'TEXTAREA') return true;
        if (el.tagName === 'INPUT') {
            const t = (el.type || '').toLowerCase();
            return /*t !== 'range' &&*/ t !== 'checkbox' && t !== 'radio' && t !== 'hidden' && t !== 'file' && t !== 'color' && t !== 'submit' && t !== 'button' && t !== 'reset' && t !== 'image';
        }
        return false;
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
        if (!text && isInputField(el) && el.value != null && String(el.value).trim()) {
            text = String(el.value).trim();
        }
        const result = {
            tagName: el.tagName.toLowerCase(), text: text, dataAttrs, attrs, onclickParam,
            hasStrong: !!el.id || Object.keys(dataAttrs).length > 0 || keyAttrs.some(k => attrs[k])
        };
        return result;
    }

    function matchesFingerprint(el, fp, matchMode) {
        if (!el || el.tagName.toLowerCase() !== fp.tagName) { return false; }
        if (matchMode === 'strict') {
            for (const [k, v] of Object.entries(fp.dataAttrs)) { if (el.getAttribute(k) !== v) { return false; } }
            for (const [k, v] of Object.entries(fp.attrs)) { if (v && el.getAttribute(k) !== v) { return false; } }
            if (fp.onclickParam) {
                const m = (el.getAttribute('onclick') || '').match(/useItem\((\d+)\)/);
                if (m && m[1] !== fp.onclickParam) { return false; }
            }
            if (fp.text) {
                let elText;
                if (fp.hasStrong) {
                    elText = (el.textContent || '').trim();
                    if (!elText) {
                        const visualAttrs = ['alt', 'title', 'placeholder', 'aria-label', 'value'];
                        for (const attr of visualAttrs) { const val = el.getAttribute(attr); if (val && val.trim()) { elText = val.trim(); break; } }
                    }
                    if (!elText && isInputField(el) && el.value != null && String(el.value).trim()) { elText = String(el.value).trim(); }
                } else { elText = getElText(el); }
                if (elText !== fp.text) { return false; }
            }
            return true;
        } else {
            if (fp.text) {
                let elText = (el.textContent || '').trim();
                if (!elText) {
                    const visualAttrs = ['alt', 'title', 'placeholder', 'aria-label', 'value'];
                    for (const attr of visualAttrs) { const val = el.getAttribute(attr); if (val && val.trim()) { elText = val.trim(); break; } }
                }
                if (!elText && isInputField(el) && el.value != null && String(el.value).trim()) { elText = String(el.value).trim(); }
                if (!elText) elText = getElText(el);
                if (elText !== fp.text) { return false; }
            } else {
                if (!isInputField(el)) { return false; }
            }
        }
        return true;
    }

    function tryFindTarget(targetObj) {
        if (!targetObj || !targetObj.fingerprint) return null;
        const fp = targetObj.fingerprint;
        function verifyList(list) {
            const matched = [];
            for (const el of list) {
                if (panel.contains(el)) { continue; }
                if (targets.some(t => t !== targetObj && t.element === el)) { continue; }
                if (matchesFingerprint(el, fp, targetObj.matchMode)) {
                    matched.push(el);
                }
            }
            return matched.length > 0 ? matched : null;
        }
        let root = document;
        if (targetObj.parentSelector) {
            try {
                const p = document.querySelector(targetObj.parentSelector);
                if (p) root = p;
            } catch (e) {}
        }
        try {
            if (targetObj.strict) {
                const queryResult = root.querySelectorAll(targetObj.strict);
                const found = verifyList(queryResult);
                if (found) { return found; }
            }
            if (targetObj.loose) {
                const queryResult = root.querySelectorAll(targetObj.loose);
                const found = verifyList(queryResult);
                if (found) { return found; }
            }
            const found = verifyList(root.querySelectorAll(fp.tagName));
            if (found) { return found; }
        } catch (e) { console.error('[AUTO_OP] tryFindTarget 异常:', e); }
        if (root !== document) {
            try {
                if (targetObj.strict) {
                    const queryResult = document.querySelectorAll(targetObj.strict);
                    const found = verifyList(queryResult);
                    if (found) { return found; }
                }
                if (targetObj.loose) {
                    const queryResult = document.querySelectorAll(targetObj.loose);
                    const found = verifyList(queryResult);
                    if (found) { return found; }
                }
            } catch (e) {}
        }
        return null;
    }

    // ========== 父级高亮 ==========
    function refreshParentHighlights() {
        document.querySelectorAll('.ac-parent-highlight').forEach(el => {
            if (!panel.contains(el)) {
                el.classList.remove('ac-parent-highlight');
                el.style.removeProperty('z-index');
            }
        });

        const parentMap = new Map();
        for (const t of targets) {
            if (!t.parentChain || t.parentChain.length === 0) continue;
            const p = t.parentChain[0]; // 只取最近的一层父级
            if (!p) continue;
            if (!parentMap.has(p.selector)) {
                parentMap.set(p.selector, []);
            }
            if (t.element && document.contains(t.element)) {
                parentMap.get(p.selector).push(t.element);
            }
        }

        for (const [selector, children] of parentMap) {
            let parent;
            try { parent = document.querySelector(selector); } catch(e) {}
            if (!parent || panel.contains(parent)) continue;

            let maxZ = 0;
            for (const child of children) {
                const computed = window.getComputedStyle(child);
                const z = parseInt(computed.zIndex, 10);
                if (!isNaN(z) && z > maxZ) maxZ = z;
            }

            parent.classList.add('ac-parent-highlight');
            parent.style.zIndex = (maxZ + 1) + '';
        }
    }

    // ========== 运行时发现新匹配元素 ==========
    const discoveredElements = new Set();

    function discoverNewTargets() {
        if (targets.length === 0) return;

        const existingElements = new Set();
        for (const t of targets) {
            if (t.element) existingElements.add(t.element);
        }

        for (const el of discoveredElements) {
            if (!document.contains(el)) discoveredElements.delete(el);
        }

        const newTargets = [];
        const seenKeys = new Set();

        for (const t of targets) {
            if (t.matchMode !== 'loose') continue;
            if (!t.parentSelector) continue;

            const selector = t.loose || t.strict;
            const seenKey = selector + '|' + t.parentSelector;
            if (seenKeys.has(seenKey)) continue;
            seenKeys.add(seenKey);

            let parent;
            try {
                parent = document.querySelector(t.parentSelector);
            } catch (e) {}

            let candidates;

            if (parent) {
                try {
                    candidates = parent.querySelectorAll(selector);
                } catch (e) {}

                if (!candidates || candidates.length === 0) {
                    try {
                        candidates = parent.querySelectorAll(t.fingerprint.tagName);
                    } catch (e) {
                        candidates = [];
                    }
                }
            } else {
                continue;
            }

            for (const el of candidates) {
                if (panel.contains(el)) continue;
                if (existingElements.has(el)) continue;
                if (discoveredElements.has(el)) continue;
                if (!matchesFingerprint(el, t.fingerprint, t.matchMode)) continue;

                discoveredElements.add(el);
                el.classList.add('ac-selected-highlight');
                newTargets.push({
                    element: el,
                    strict: t.strict,
                    loose: t.loose,
                    fingerprint: t.fingerprint,
                    desc: t.desc,
                    isInput: t.isInput,
                    matchMode: t.matchMode,
                    parentSelector: t.parentSelector,
                    parentChain: t.parentChain,
                    isAuto: true,
                    missCount: 0
                });
            }
        }

        if (newTargets.length > 0) {
            targets.push(...newTargets);
        }
    }

    // ========== 持久化函数 ==========
    function saveData() {
        const toSave = {
            isMultiMode, clickStrategy,
            clickInterval: parseInt(clickIntervalInput.value) || 1100,
            maxClicks: maxClicksInput.value,
            missingAction: missingActionSelect.value,
            autoFillContent: autoFillInput.value,
            targets: targets.map(t => ({
                strict: t.strict, loose: t.loose, fingerprint: t.fingerprint,
                desc: t.desc, isInput: t.isInput, matchMode: t.matchMode, parentSelector: t.parentSelector, parentChain: t.parentChain || [],
                isAuto: !!t.isAuto
            }))
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    }

    function loadData() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        try {
            const cfg = JSON.parse(saved);
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
                const base = {
                    strict: t.strict,
                    loose: t.loose,
                    fingerprint: t.fingerprint,
                    desc: t.desc,
                    isInput: !!t.isInput,
                    matchMode: t.matchMode || 'strict',
                    parentSelector: t.parentSelector || '',
                    parentChain: t.parentChain || [],
                    isAuto: !!t.isAuto,
                    missCount: 0
                };
                const found = tryFindTarget({ ...base, element: null });
                if (found && found.length > 0) {
                    found.forEach(el => {
                        const obj = { ...base, element: el };
                        el.classList.add('ac-selected-highlight');
                        targets.push(obj);
                        discoveredElements.add(el);
                    });
                } else {
                    targets.push({ ...base, element: null });
                }
            });
            targets.forEach(t => { t._isValid = !!t.element && document.contains(t.element) && matchesFingerprint(t.element, t.fingerprint, t.matchMode); });
            updateTargetUI();
            updateTargetCount();
            updateAutoFillVisibility();
            refreshParentHighlights();
            if (targets.length > 0) { stateSpan.textContent = '就绪'; }
        } catch (e) { console.error("[AUTO_OP] loadData 异常:", e); }
    }

    // ========== UI 更新 ==========
    function updateTargetUI() {
        if (targets.length === 0) {
            targetListContainer.innerHTML = '<div class="ac-target-info">未选取，请点击下方按钮选取</div>';
            btnClearAll.style.display = 'none';
            btnStart.disabled = true;
            btnHeaderStart.disabled = true;
            return;
        }
        btnClearAll.style.display = 'inline-block';
        btnStart.disabled = false;
        btnHeaderStart.disabled = false;

        const list = targetListContainer.querySelector('.ac-target-list');
        const existingCount = list ? list.querySelectorAll('.ac-target-item').length : 0;

        if (existingCount === targets.length && list) return;

        let html = '';
        targets.forEach((t, i) => {
            const isValid = t._isValid !== undefined ? t._isValid : (t.element && document.contains(t.element));
            html += `<div class="ac-target-item ${isValid ? 'active' : 'missing'}" data-index="${i}">
                <span>${isMultiMode ? (i + 1) + '. ' : ''}${t.desc}</span>
                ${t.parentChain ? t.parentChain.map(p => '<span class="ac-target-parent">↓ ' + p.desc + '</span>').join('') : ''}
                <select class="ac-match-mode" data-index="${i}">
                    <option value="strict" ${t.matchMode === 'strict' ? 'selected' : ''}>严格</option>
                    <option value="loose" ${t.matchMode === 'loose' ? 'selected' : ''}>宽松</option>
                </select>
                <button class="ac-btn-item-del" onclick="window._acRemoveTarget(${i})">✕</button>
            </div>`;
        });
        targetListContainer.innerHTML = '<div class="ac-target-list">' + html + '</div>';

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
    }

    // ========== 自动填充行显隐控制 ==========
    function updateAutoFillVisibility() {
        const autoFillRow = document.getElementById('ac-auto-fill-row');
        if (!autoFillRow) return;
        const hasInputTarget = targets.some(t => t.isInput);
        autoFillRow.style.display = hasInputTarget ? 'block' : 'none';
    }

    function updateTargetCount(status) {
        if (!status) {
            let existCount = 0;
            let missingCount = 0;
            let total = targets.length;
            for (let i = 0; i < total; i++) {
                const t = targets[i];
                const el = t.element;
                if (el && document.contains(el) && t._isValid) existCount++;
                else missingCount++;
            }
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
        if (uiThrottled) return;
        const item = targetListContainer.querySelector(`.ac-target-item[data-index="${index}"]`);
        if (!item) return;
        if (isMissing) { item.classList.remove('active'); item.classList.add('missing'); }
        else { item.classList.remove('missing'); item.classList.add('active'); }
    }

    window._acRemoveTarget = function(index) {
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
            refreshParentHighlights();
            saveData();
            updateAutoFillVisibility();
        }
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
    });

    // ========== 交互事件 ==========
    multiModeCheckbox.addEventListener('change', (e) => {
        isMultiMode = e.target.checked;
        strategyRow.style.display = isMultiMode ? 'block' : 'none';
        clickStrategy = strategySelect.value;
        clearSelection();
        saveData();
    });
    strategySelect.addEventListener('change', (e) => { clickStrategy = e.target.value; saveData(); })
    autoFillInput.addEventListener('input', (e) => { autoFillContent = e.target.value; saveData(); });
    [clickIntervalInput, maxClicksInput, missingActionSelect].forEach(el => { el.addEventListener('change', saveData); });

    btnPick.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isRunning) return;
        isPicking = !isPicking;
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
        if (stateTimerID) { clearTimeout(stateTimerID); stateTimerID = null; }
        el.classList.remove('ac-highlight');
        if (targets.some(t => t.element === el) && isMultiMode) { return; }
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
        const isInput = isInputField(el);
        if (isInput) desc += ' (isInput)';
        let parentSelector = '';
        let parentChain = [];
        let ancestor = el.parentElement;
        while (ancestor && ancestor !== document.body) {
            const s = buildBaseSelector(ancestor);
            if (s !== ancestor.tagName.toLowerCase()) {
                if (!parentSelector) parentSelector = s;
                let pdesc = ancestor.tagName.toLowerCase();
                if (ancestor.id) pdesc += '#' + ancestor.id;
                if (ancestor.className && typeof ancestor.className === 'string') {
                    const cls = ancestor.className.trim().split(/\s+/).filter(c => c && !c.startsWith('ac-')).slice(0, 5).join('.');
                    if (cls) pdesc += '.' + cls;
                }
                parentChain.push({ selector: s, desc: pdesc });
            }
            ancestor = ancestor.parentElement;
        }

        const targetObj = { element: el, strict: sels.strict, loose: sels.loose, fingerprint: fp, desc, isInput, matchMode: isInput ? 'loose' : 'strict', parentSelector, parentChain, isAuto: false, missCount: 0, _isValid: true };
        if (isMultiMode) {
            targets.push(targetObj);
            el.classList.add('ac-selected-highlight');
            stateSpan.textContent = `已选 ${targets.length} 个，继续选取或取消`;
        } else {
            targets.forEach(t => { if (t.element) t.element.classList.remove('ac-selected-highlight'); });
            targets = [targetObj];
            el.classList.add('ac-selected-highlight');
            exitPickMode();
            if (targets.length > 0) { stateSpan.textContent = '就绪'; }
        }
        updateTargetUI();
        updateTargetCount();
        refreshParentHighlights();
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
        refreshParentHighlights();
        saveData();
        updateAutoFillVisibility();
    }

    btnClearAll.addEventListener('click', (e) => { e.stopPropagation(); clearSelection(); });

    // 统一的开始/停止事件处理函数
    function handleToggleRunning(e) {
        e.stopPropagation();
        if (targets.length === 0) return;
        if (!isRunning) { startClicking(); }
        else { stopClicking(); stateSpan.textContent = '已停止'; }
    }
    btnStart.addEventListener('click', handleToggleRunning);
    btnHeaderStart.addEventListener('click', handleToggleRunning);

    function startClicking() {
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
        timerID = setInterval(doClick, clickInterval);
        requestWakeLock();
        suppressFocus();
        saveData();
    }

    function startWaitTimer(idx) {
        if (waitTimerID) clearTimeout(waitTimerID);
        function update() {
            if (!isWaiting || !isRunning) {
                if (waitTimerID) { clearTimeout(waitTimerID); waitTimerID = null; }
                return;
            }
            const maxWait = clickInterval * 2;
            const elapsed = Date.now() - waitStartTime;
            const remaining = maxWait - elapsed;
            if (remaining <= 0) {
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
            if (targets.length === 0) {
                stopClicking();
                return;
            }

            discoverNewTargets();

            if (!doClick._lastUIUpdate) doClick._lastUIUpdate = 0;
            const now = Date.now();
            uiThrottled = (now - doClick._lastUIUpdate) < 100;
            if (!uiThrottled) doClick._lastUIUpdate = now;

            const status = targets.map((t, i) => {
                let el = t.element;
                let isValid = el && document.contains(el) && matchesFingerprint(el, t.fingerprint, t.matchMode);

                if (!isValid) {
                    const found = tryFindTarget(t);
                    if (found && found.length > 0) {
                        if (t.element && document.contains(t.element)) t.element.classList.remove('ac-selected-highlight');
                        t.element = found[0];
                        found[0].classList.add('ac-selected-highlight');
                        isValid = true;
                    }
                }

                updateTargetItemStyle(i, !isValid);
                return isValid;
            });

            const totalCount = targets.length;
            for (let i = 0; i < totalCount; i++) {
                targets[i]._isValid = status[i];
            }
            if (!uiThrottled) updateTargetCount(status);

            // ========== 队列模式 ==========
            if (isMultiMode && clickStrategy === 'sequential') {
                const idx = currentQueueIndex;

                if (idx >= totalCount) {
                    currentQueueIndex = 0;
                    return;
                }

                if (status[idx]) {
                    if (isWaiting) {
                        isWaiting = false;
                        if (waitTimerID) {
                            clearTimeout(waitTimerID);
                            waitTimerID = null;
                        }
                    }

                    const t = targets[idx];
                    const el = t.element;

                    if (t.isInput) {
                        if (isInputField(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                            el.value = autoFillContent;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        } else if (el.isContentEditable) { el.innerHTML = autoFillContent; }
                    } else { el.click(); }
                    clickedCount++;
                    countSpan.textContent = clickedCount;
                    stateSpan.textContent = `队列[${idx + 1}/${totalCount}]`;
                    stateSpan.classList.remove('ac-waiting');
                    currentQueueIndex = (idx + 1) % totalCount;

                    if (clickedCount >= maxClicks) {
                        stopClicking();
                        stateSpan.textContent = '已完成';
                    }
                } else {
                    if (missingActionSelect.value === 'stop') {
                        stopClicking();
                        stateSpan.textContent = `队列[${idx + 1}] 元素已消失`;
                        stateSpan.classList.remove('ac-waiting');
                    } else {
                        if (!isWaiting) {
                            isWaiting = true;
                            waitStartTime = Date.now();
                            startWaitTimer(idx);
                        }
                    }
                }

                // ---- 队列模式操作完成后，执行自动清理 ----
                cleanupAutoTargets(status);
                return;
            }

            // ========== 同时模式 ==========
            let shouldStop = false;
            let anyClicked = false;

            for (let i = 0; i < totalCount; i++) {
                const t = targets[i];

                if (status[i]) {
                    anyClicked = true;
                    const el = t.element;

                    if (t.isInput) {
                        if (isInputField(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                            el.value = autoFillContent;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        } else if (el.isContentEditable) { el.innerHTML = autoFillContent; }
                    } else { el.click(); }
                } else { if (missingActionSelect.value === 'stop') shouldStop = true; }
            }

            if (shouldStop) {
                stopClicking();
                stateSpan.textContent = '元素已消失';
                stateSpan.classList.remove('ac-waiting');
                return;
            }

            if (anyClicked) {
                clickedCount++;
                countSpan.textContent = clickedCount;
                stateSpan.textContent = isMultiMode && clickStrategy === 'simultaneous' ? '同时操作运行中' : '运行中';
                stateSpan.classList.remove('ac-waiting');

                if (clickedCount >= maxClicks) {
                    stopClicking();
                    stateSpan.textContent = '已完成';
                }
            }

            // ---- 同时模式操作完成后，执行自动清理 ----
            cleanupAutoTargets(status);

        } catch (e) {
            console.error('[AUTO_OP] doClick 异常:', e);
        }
    }

    function cleanupAutoTargets(status) {
        for (let i = targets.length - 1; i >= 0; i--) {
            if (!targets[i].isAuto) continue;
            if (status[i] !== undefined && status[i]) {
                targets[i].missCount = 0;
            } else if (status[i] === false) {
                targets[i].missCount = (targets[i].missCount || 0) + 1;
                if (targets[i].missCount >= 5) {
                    if (targets[i].element && targets[i].element.classList) {
                        targets[i].element.classList.remove('ac-selected-highlight');
                    }
                    discoveredElements.delete(targets[i].element);
                    targets.splice(i, 1);
                }
            }
        }

        // 清理后对齐 currentQueueIndex
        if (targets.length > 0 && currentQueueIndex >= targets.length) {
            currentQueueIndex = 0;
        }

        if (!uiThrottled) refreshParentHighlights();
        if (!uiThrottled) updateTargetUI();
        if (!uiThrottled) updateTargetCount();
    }

    function stopClicking() {
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