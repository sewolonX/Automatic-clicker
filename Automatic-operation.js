// ==UserScript==
// @name         Automatic-operation
// @namespace    https://github.com/sewolonX/Automatic-operation
// @version      4.5
// @description  选取元素后自动点击/输入，严格宽松双模式，支持单选、多选、队列模式，跨刷新保存，初始最小化。
// @author       GLM
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ========== 持久化存储 ==========
    const STORAGE_KEY = 'AUTO_OP_CONFIG_' + window.location.hostname;

    // ========== 状态变量 ==========
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

    // ========== 注入样式 ==========
    const style = document.createElement('style');
    style.textContent = `
        :root {
            --panel-bg: #1a1a2e;
            --panel-border: #333;
            --panel-text: #e0e0e0;
            --panel-input-bg: #0f0f23;
            --panel-input-border: #333;
            --panel-input-text: #e0e0e0;
            --panel-label-text: #888;
            --panel-button-bg: rgba(255,255,255,0.06);
            --panel-button-border: rgba(255,255,255,0.1);
            --panel-button-text: #999;
            --panel-button-hover-bg: rgba(255,255,255,0.12);
            --panel-button-hover-text: #fff;
            --panel-active-border: #4ade80;
            --panel-active-text: #4ade80;
            --panel-waiting-text: #f59e0b;
            --panel-highlight: #f59e0b;
            --panel-selected-highlight: #4ade80;
            --panel-missing-border: #dc2626;
            --panel-missing-text: #dc2626;
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
            --panel-active-border: #10b981;
            --panel-active-text: #10b981;
            --panel-waiting-text: #d97706;
            --panel-highlight: #d97706;
            --panel-selected-highlight: #10b981;
            --panel-missing-border: #dc2626;
            --panel-missing-text: #dc2626;
            .ac-row-checkbox input[type="checkbox"] { color-scheme: light; }
            .ac-status .ac-count { color: #3482FF; }
        }
        #ac-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 2147483647;
            background: var(--panel-bg);
            color: var(--panel-text);
            border: 1px solid var(--panel-border);
            border-radius: 12px;
            padding: 0;
            width: 300px;
            font-size: 13px;
            font-family: inherit;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            transition: opacity 0.3s;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .ac-header {
            position: sticky;
            top: 0;
            background: var(--panel-bg);
            border-bottom: 1px solid var(--panel-border);
            padding: 14px 14px 14px 14px;
            cursor: move;
            min-height: 44px;
            touch-action: none;
            z-index: 1;
            display: flex;
            align-items: center;
            flex-shrink: 0;
        }
        .ac-header h3 {
            margin: 0;
            font-size: 15px;
            font-weight: 700;
            font-family: inherit;
            color: var(--panel-text);
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
            overflow: hidden;
            white-space: nowrap;
            flex: 1;
        }
        .ac-toggle {
            flex-shrink: 0;
            width: 30px;
            height: 30px;
            background: var(--panel-button-bg);
            border: 1px solid var(--panel-button-border);
            color: var(--panel-button-text);
            font-size: 18px;
            font-family: inherit;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            border-radius: 6px;
            margin-right: 12px;
            line-height: 1;
            transition: all 0.2s;
        }
        .ac-toggle:hover {
            background: var(--panel-button-hover-bg);
            color: var(--panel-button-hover-text);
        }
        .ac-toggle:active {
            transform: scale(0.92);
        }
        .ac-header-start {
            flex-shrink: 0;
            width: 30px;
            height: 30px;
            border: none;
            color: #fff;
            font-size: 14px;
            font-family: inherit;
            cursor: pointer;
            display: none; /* 默认隐藏 */
            align-items: center;
            justify-content: center;
            padding: 0;
            border-radius: 6px;
            margin-right: 8px;
            line-height: 1;
            transition: all 0.2s;
            background: #16a34a; /* 开始状态背景色 */
            opacity: 0.9 !important;
        }
        .ac-header-start:hover {
            background: #22c55e;
            opacity: 1 !important;
        }
        .ac-header-start.is-stop {
            background: #dc2626; /* 停止状态背景色 */
            opacity: 0.9 !important;
        }
        .ac-header-start.is-stop:hover {
            background: #ef4444;
            opacity: 1 !important;
        }
        .ac-header-start:active {
            transform: scale(0.92);
        }
        .ac-header-start:disabled {
            opacity: 0.4 !important;
            cursor: not-allowed;
        }
        /* 仅在折叠状态显示 */
        #ac-panel.collapsed .ac-header-start {
            display: flex;
        }
        .ac-body {
            padding: 14px 14px 14px;
            overflow-y: auto;
            max-height: 55vh;
        }
        #ac-panel.collapsed .ac-body {
            display: none;
        }
        #ac-panel.collapsed {
            width: auto;
        }
        .ac-row {
            margin-bottom: 12px;
        }
        .ac-row label {
            display: block;
            font-size: 11px;
            font-family: inherit;
            color: var(--panel-label-text);
            margin-bottom: 5px;
            letter-spacing: 0.5px;
        }
        .ac-row input[type="number"], .ac-row select, .ac-row input[type="text"] {
            width: 100%;
            background: var(--panel-input-bg);
            border: 1px solid var(--panel-input-border);
            border-radius: 6px;
            color: var(--panel-input-text);
            padding: 7px 10px;
            font-size: 13px;
            font-family: inherit;
            outline: none;
            box-sizing: border-box;
            -webkit-appearance: none;
        }
        .ac-row input[type="number"]:focus, .ac-row select:focus, .ac-row input[type="text"]:focus {
            border-color: var(--panel-active-border);
        }
        .ac-row input[type="number"]::placeholder {
            color: var(--panel-label-text);
        }
        .ac-row select option {
            background: var(--panel-input-bg);
            color: var(--panel-input-text);
        }
        .ac-row-checkbox {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }
        .ac-row-checkbox label {
            margin-bottom: 0;
            flex: 1;
            font-size: 11px;
            font-family: inherit;
            color: var(--panel-label-text);
            letter-spacing: 0.5px;
        }
        .ac-row-checkbox input[type="checkbox"] {
            width: 16px;
            height: 16px;
            cursor: pointer;
            color-scheme: dark;
            accent-color: var(--panel-active-border);
            background-color: var(--panel-input-bg);
            border: 1px solid var(--panel-input-border);
        }
        .ac-target-list-container {
            min-height: 34px;
        }
        .ac-target-info {
            background: var(--panel-input-bg);
            border: 1px solid var(--panel-input-border);
            border-radius: 6px;
            padding: 8px 10px;
            font-size: 12px;
            font-family: inherit;
            color: var(--panel-label-text);
            word-break: break-all;
            min-height: 34px;
            line-height: 1.5;
        }
        .ac-target-list {
            max-height: 200px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .ac-target-item {
            background: var(--panel-input-bg);
            border: 1px solid var(--panel-input-border);
            border-radius: 6px;
            padding: 8px 10px;
            font-size: 12px;
            font-family: inherit;
            color: var(--panel-label-text);
            word-break: break-all;
            line-height: 1.5;
            position: relative;
            min-height: 54px;
            max-height: 60px;
            overflow-y: auto;
            box-sizing: border-box;
            transition: border-color 0s, color 0s;
        }
        .ac-target-item.active {
            border-color: var(--panel-active-border);
            color: var(--panel-active-text);
        }
        .ac-target-item.missing {
            border-color: var(--panel-missing-border);
            color: var(--panel-missing-text);
        }
        .ac-target-item span {
            display: block;
            padding-right: 20px;
            white-space: pre-wrap;
        }
        .ac-btn-item-del {
            position: absolute;
            top: 4px;
            right: 4px;
            width: 16px;
            height: 16px;
            background: var(--panel-button-bg);
            border: 1px solid var(--panel-button-border);
            color: var(--panel-button-text);
            font-size: 10px;
            font-family: inherit;
            line-height: 14px;
            text-align: center;
            border-radius: 4px;
            cursor: pointer;
            padding: 0;
            transition: all 0.2s;
        }
        .ac-btn-item-del:hover {
            background: #dc2626;
            color: #fff;
            border-color: #dc2626;
        }
        .ac-btn-group {
            display: flex;
            gap: 8px;
            margin-top: 14px;
        }
        .ac-btn {
            flex: 1;
            padding: 9px 0;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            transition: all 0.2s;
        }
        .ac-btn:active {
            transform: scale(0.96);
        }
        .ac-btn-pick {
            background: var(--panel-button-bg);
            color: var(--panel-button-text);
        }
        .ac-btn-pick:hover {
            background: var(--panel-button-hover-bg);
            color: var(--panel-button-hover-text);
        }
        .ac-btn-pick.picking {
            background: #f59e0b;
            color: #000;
            animation: ac-pulse 1s infinite;
        }
        .ac-btn-pick:disabled, .ac-btn-start:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        .ac-btn-start {
            background: #16a34a;
            color: #fff;
        }
        .ac-btn-start:hover {
            background: #22c55e;
        }
        .ac-btn-stop {
            background: #dc2626;
            color: #fff;
        }
        .ac-btn-stop:hover {
            background: #ef4444;
        }
        .ac-status {
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid #222;
            font-size: 12px;
            font-family: inherit;
            color: var(--panel-label-text);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .ac-status .ac-count {
            color: #277AF7;
            font-weight: 600;
            font-size: 14px;
            font-family: inherit;
        }
        .ac-status.running .ac-count {
            animation: ac-pulse 0.8s infinite;
        }
        .ac-status .ac-waiting {
            color: var(--panel-waiting-text);
            font-size: 11px;
            font-family: inherit;
        }
        .ac-highlight {
            outline: 2px dashed var(--panel-highlight) !important;
            outline-offset: 2px !important;
            cursor: crosshair !important;
        }
        .ac-selected-highlight {
            outline: 2px solid var(--panel-selected-highlight) !important;
            outline-offset: 2px !important;
        }
        .ac-btn-cancel {
            flex-shrink: 0;
            padding: 1px 8px;
            font-size: 11px;
            font-family: inherit;
            background: var(--panel-button-bg);
            border: 1px solid var(--panel-button-border);
            color: var(--panel-button-text);
            border-radius: 4px;
            cursor: pointer;
            white-space: nowrap;
            max-width: 40px;
            text-align: center;
        }
        .ac-btn-cancel:hover {
            background: var(--panel-button-hover-bg);
            color: var(--panel-button-hover-text);
        }
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
            <div class="ac-row-checkbox">
                <label>多选模式</label>
                <input type="checkbox" id="ac-multi-mode">
            </div>
            <div class="ac-row" id="ac-strategy-row" style="display: none;">
                <label>点击策略</label>
                <select id="ac-click-strategy">
                    <option value="simultaneous">同时点击</option>
                    <option value="sequential">队列点击</option>
                </select>
            </div>
            <div class="ac-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <label style="margin-bottom: 0;">目标元素</label>
                <button class="ac-btn ac-btn-cancel" id="ac-btn-clear-all" style="display: none;">清空</button>
            </div>
            <div class="ac-row" style="margin-top: 0;">
                <div class="ac-target-list-container" id="ac-target-list-container">
                    <div class="ac-target-info">未选取，请点击下方按钮选取</div>
                </div>
            </div>
            <div class="ac-row">
                <label>自动填充内容</label>
                <input type="text" id="ac-auto-fill" placeholder="输入内容（留空为点击）">
            </div>
            <div class="ac-row">
                <label>点击次数</label>
                <input type="number" id="ac-max-clicks" min="0" placeholder="留空为无限">
            </div>
            <div class="ac-row">
                <label>点击间隔（ms）</label>
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
                <span>已点击：<span class="ac-count" id="ac-count">0</span> 次</span>
                <span id="ac-state">就绪</span>
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
    const multiModeCheckbox = document.getElementById('ac-multi-mode');
    const strategyRow = document.getElementById('ac-strategy-row');
    const strategySelect = document.getElementById('ac-click-strategy');
    const btnHeaderStart = document.getElementById('ac-btn-header-start'); // 标题栏开始/停止按钮

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
                if (val && val.trim() && val.trim().length < 50) {
                    text = val.trim();
                    break;
                }
            }
        }
        if (!text && el.children.length > 0) {
            for (const child of el.children) {
                const cText = (child.textContent || '').trim();
                if (cText) {
                    text = cText;
                    break;
                }
                for (const attr of ['alt', 'title']) {
                    const val = child.getAttribute(attr);
                    if (val && val.trim()) {
                        text = val.trim();
                        break;
                    }
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
                        if (content && !(content.length <= 2 && /[\uE000-\uF8FF]/.test(content))) {
                            text = content;
                            break;
                        }
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
        return {
            tagName: el.tagName.toLowerCase(),
            text: text,
            dataAttrs,
            attrs,
            onclickParam,
            hasStrong: !!el.id || Object.keys(dataAttrs).length > 0 || keyAttrs.some(k => attrs[k])
        };
    }

    function matchesFingerprint(el, fp, matchMode) {
        if (!el || el.tagName.toLowerCase() !== fp.tagName) return false;
        if (matchMode === 'strict') {
            for (const [k, v] of Object.entries(fp.dataAttrs)) {
                if (el.getAttribute(k) !== v) return false;
            }
            for (const [k, v] of Object.entries(fp.attrs)) {
                if (v && el.getAttribute(k) !== v) return false;
            }
            if (fp.onclickParam) {
                const m = (el.getAttribute('onclick') || '').match(/useItem\((\d+)\)/);
                if (m && m[1] !== fp.onclickParam) return false;
            }
            if (fp.text) {
                let elText;
                if (fp.hasStrong) {
                    elText = (el.textContent || '').trim();
                    if (!elText) {
                        const visualAttrs = ['alt', 'title', 'placeholder', 'aria-label', 'value'];
                        for (const attr of visualAttrs) {
                            const val = el.getAttribute(attr);
                            if (val && val.trim()) {
                                elText = val.trim();
                                break;
                            }
                        }
                    }
                } else {
                    elText = getElText(el);
                }
                if (elText !== fp.text) return false;
            }
        } else {
            if (fp.text) {
                let elText = (el.textContent || '').trim();
                if (!elText) {
                    const visualAttrs = ['alt', 'title', 'placeholder', 'aria-label', 'value'];
                    for (const attr of visualAttrs) {
                        const val = el.getAttribute(attr);
                        if (val && val.trim()) {
                            elText = val.trim();
                            break;
                        }
                    }
                }
                if (!elText) elText = getElText(el);
                if (elText !== fp.text) return false;
            }
        }
        return true;
    }

    function tryFindTarget(targetObj) {
        if (!targetObj || !targetObj.fingerprint) return null;
        const fp = targetObj.fingerprint;
        function verifyList(list) {
            for (const el of list) {
                if (panel.contains(el)) continue;
                if (targets.some(t => t !== targetObj && t.element === el)) continue;
                if (matchesFingerprint(el, fp, targetObj.matchMode)) return el;
            }
            return null;
        }
        try {
            if (targetObj.strict) {
                const found = verifyList(document.querySelectorAll(targetObj.strict));
                if (found) return found;
            }
            if (targetObj.loose) {
                const found = verifyList(document.querySelectorAll(targetObj.loose));
                if (found) return found;
            }
            const found = verifyList(document.querySelectorAll(fp.tagName));
            if (found) return found;
        } catch (e) {}
        return null;
    }

    // ========== 持久化函数 ==========
    function saveData() {
        const toSave = {
            isMultiMode,
            clickStrategy,
            clickInterval: parseInt(clickIntervalInput.value) || 1100,
            maxClicks: maxClicksInput.value,
            missingAction: missingActionSelect.value,
            autoFillContent: autoFillInput.value,
            targets: targets.map(t => ({
                strict: t.strict,
                loose: t.loose,
                fingerprint: t.fingerprint,
                desc: t.desc,
                isInput: t.isInput,
                matchMode: t.matchMode
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

            targets = (cfg.targets || []).map(t => {
                const obj = {
                    strict: t.strict,
                    loose: t.loose,
                    fingerprint: t.fingerprint,
                    desc: t.desc,
                    isInput: !!t.isInput,
                    matchMode: t.matchMode || 'strict',
                    element: null
                };
                const found = tryFindTarget(obj);
                if (found) {
                    obj.element = found;
                    found.classList.add('ac-selected-highlight');
                }
                return obj;
            });
            updateTargetUI();
        } catch (e) {
            console.error("自动操作脚本配置加载失败", e);
        }
    }

    // ========== UI 更新 ==========
    function updateTargetUI() {
        if (targets.length === 0) {
            targetListContainer.innerHTML = '<div class="ac-target-info">未选取，请点击下方按钮选取</div>';
            btnClearAll.style.display = 'none';
            btnStart.disabled = true;
            btnHeaderStart.disabled = true; // 同步禁用状态
            return;
        }
        btnClearAll.style.display = 'inline-block';
        btnStart.disabled = false;
        btnHeaderStart.disabled = false; // 同步启用状态

        let html = '<div class="ac-target-list">';
        targets.forEach((t, i) => {
            html += `<div class="ac-target-item active" data-index="${i}">
                <span>${isMultiMode ? (i + 1) + '. ' : ''}${t.desc}</span>
                <select class="ac-match-mode" data-index="${i}" style="position: absolute; right: 24px; top: 4px; width: 42px; height: 16px; font-size: 10px; font-family: inherit; padding: 0 4px; background: var(--panel-input-bg); border: 1px solid var(--panel-input-border); color: var(--panel-input-text); border-radius: 4px; opacity: 0.8;">
                    <option value="strict" ${t.matchMode === 'strict' ? 'selected' : ''}>严格</option>
                    <option value="text" ${t.matchMode === 'text' ? 'selected' : ''}>宽松</option>
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
    }

    function updateTargetItemStyle(index, isMissing) {
        const item = targetListContainer.querySelector(`.ac-target-item[data-index="${index}"]`);
        if (!item) return;
        if (isMissing) {
            item.classList.remove('active');
            item.classList.add('missing');
        } else {
            item.classList.remove('missing');
            item.classList.add('active');
        }
    }

    window._acRemoveTarget = function(index) {
        if (targets[index]) {
            if (targets[index].element) targets[index].element.classList.remove('ac-selected-highlight');
            targets.splice(index, 1);
            if (currentQueueIndex >= targets.length) currentQueueIndex = 0;
            updateTargetUI();
            stateSpan.textContent = targets.length === 0 ? '目标元素已清空' : `已选 ${targets.length} 个，继续点击或取消`;
            saveData();
        }
    };

    // ========== 拖拽逻辑 ==========
    let isDragging = false, dragOffX = 0, dragOffY = 0;

    function getEventPos(e) {
        return e.touches && e.touches.length > 0 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
    }

    function onDragStart(e) {
        if (e.target === toggleBtn || toggleBtn.contains(e.target)) return;
        if (e.target === btnHeaderStart || btnHeaderStart.contains(e.target)) return; // 排除按钮拖拽
        isDragging = true;
        const pos = getEventPos(e);
        const rect = panel.getBoundingClientRect();
        dragOffX = pos.x - rect.left;
        dragOffY = pos.y - rect.top;
        e.preventDefault();
    }

    function onDragMove(e) {
        if (!isDragging) return;
        const pos = getEventPos(e);
        let x = pos.x - dragOffX
        let y = pos.y - dragOffY;
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
        panel.style.right = 'auto';
        e.preventDefault();
    }

    function onDragEnd() {
        isDragging = false;
    }

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

    strategySelect.addEventListener('change', (e) => {
        clickStrategy = e.target.value;
        saveData();
    });

    autoFillInput.addEventListener('input', (e) => {
        autoFillContent = e.target.value;
        saveData();
    });

    [clickIntervalInput, maxClicksInput, missingActionSelect].forEach(el => {
        el.addEventListener('change', saveData);
    });

    btnPick.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isRunning) return;
        isPicking = !isPicking;
        if (isPicking) {
            btnPick.textContent = '取消选取';
            btnPick.classList.add('picking');
            stateSpan.textContent = isMultiMode ? '请依次点击多个元素' : '请点击目标元素';
            stateSpan.classList.remove('ac-waiting');
            document.addEventListener('mouseover', onPickHover, true);
            document.addEventListener('mouseout', onPickHoverOut, true);
            document.addEventListener('click', onPickClick, true);
            document.addEventListener('touchend', onPickTouch, true);
        } else {
            exitPickMode();
        }
    });

    function onPickHover(e) {
        if (!isPicking) return;
        const el = e.target;
        if (panel.contains(el)) return;
        el.classList.add('ac-highlight');
    }

    function onPickHoverOut(e) {
        e.target.classList.remove('ac-highlight');
    }

    function onPickTouch(e) {
        if (!isPicking || isDragging) return;
        const touch = e.changedTouches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!el || panel.contains(el)) return;
        e.preventDefault();
        e.stopPropagation();
        selectTarget(el);
    }

    function onPickClick(e) {
        if (!isPicking) return;
        const el = e.target;
        if (panel.contains(el)) return;
        e.preventDefault();
        e.stopPropagation();
        selectTarget(el);
    }

    function selectTarget(el) {
        el.classList.remove('ac-highlight');
        if (targets.some(t => t.element === el) && isMultiMode) {
            exitPickMode();
            return;
        }
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

        const targetObj = {
            element: el,
            strict: sels.strict,
            loose: sels.loose,
            fingerprint: fp,
            desc,
            isInput,
            matchMode: 'strict'
        };

        if (isMultiMode) {
            targets.push(targetObj);
            el.classList.add('ac-selected-highlight');
            stateSpan.textContent = `已选 ${targets.length} 个，继续点击或取消`;
        } else {
            targets.forEach(t => {
                if (t.element) t.element.classList.remove('ac-selected-highlight');
            });
            targets = [targetObj];
            el.classList.add('ac-selected-highlight');
            exitPickMode();
            stateSpan.textContent = '就绪';
        }
        updateTargetUI();
        saveData();
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
    }

    function clearSelection() {
        targets.forEach(t => {
            if (t.element) t.element.classList.remove('ac-selected-highlight');
        });
        targets = [];
        currentQueueIndex = 0;
        updateTargetUI();
        stateSpan.textContent = '目标元素已清空';
        saveData();
    }

    btnClearAll.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSelection();
    });

    // 统一的开始/停止事件处理函数
    function handleToggleRunning(e) {
        e.stopPropagation();
        if (targets.length === 0) return;
        if (!isRunning) {
            startClicking();
        } else {
            stopClicking();
            stateSpan.textContent = '已停止'; // 手动停止
        }
    }

    // 绑定统一事件
    btnStart.addEventListener('click', handleToggleRunning);
    btnHeaderStart.addEventListener('click', handleToggleRunning);

    function startClicking() {
        targets.forEach(t => {
            if (!document.contains(t.element)) {
                const found = tryFindTarget(t);
                if (found) {
                    t.element = found;
                    found.classList.add('ac-selected-highlight');
                }
            }
        });

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

        // 同步标题栏按钮状态
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
        saveData();
    }

    function doClick() {
        if (targets.length === 0) {
            stopClicking();
            return;
        }

        // 先检测所有元素状态，更新引用和样式
        const status = targets.map((t, i) => {
            let el = t.element;
            let isValid = document.contains(el) && matchesFingerprint(el, t.fingerprint, t.matchMode);
            if (!isValid) {
                el = tryFindTarget(t);
                if (el) {
                    if (t.element && document.contains(t.element)) t.element.classList.remove('ac-selected-highlight');
                    t.element = el;
                    el.classList.add('ac-selected-highlight');
                    isValid = true;
                }
            }
            updateTargetItemStyle(i, !isValid);
            return isValid;
        });

        // 队列点击模式
        if (isMultiMode && clickStrategy === 'sequential') {
            const idx = currentQueueIndex;
            if (status[idx]) {
                const t = targets[idx];
                const el = t.element;
                if (t.isInput && autoFillContent) {
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                        el.value = autoFillContent;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (el.isContentEditable) {
                        el.innerHTML = autoFillContent;
                    }
                } else {
                    el.click();
                }
                clickedCount++;
                countSpan.textContent = clickedCount;
                stateSpan.textContent = `队列[${idx + 1}/${targets.length}]`;
                stateSpan.classList.remove('ac-waiting');
                currentQueueIndex = (idx + 1) % targets.length;
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
                    stateSpan.textContent = `队列[${idx + 1}] 等待元素中`;
                    stateSpan.classList.add('ac-waiting');
                }
            }
            return;
        }

        // 同时点击模式
        let shouldStop = false;
        let anyClicked = false;
        targets.forEach((t, i) => {
            if (status[i]) {
                anyClicked = true;
                const el = t.element;
                if (t.isInput && autoFillContent) {
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                        el.value = autoFillContent;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (el.isContentEditable) {
                        el.innerHTML = autoFillContent;
                    }
                } else {
                    el.click();
                }
            } else {
                if (missingActionSelect.value === 'stop') shouldStop = true;
            }
        });

        if (shouldStop) {
            stopClicking();
            stateSpan.textContent = '元素已消失';
            stateSpan.classList.remove('ac-waiting');
            return;
        }
        if (anyClicked) {
            clickedCount++;
            countSpan.textContent = clickedCount;
            stateSpan.textContent = '运行中';
            stateSpan.classList.remove('ac-waiting');
            if (clickedCount >= maxClicks) {
                stopClicking();
                stateSpan.textContent = '已完成';
            }
        }
    }

    function stopClicking() {
        isRunning = false;
        clearInterval(timerID);
        timerID = null;

        btnStart.textContent = '开始';
        btnStart.className = 'ac-btn ac-btn-start';

        // 同步恢复标题栏按钮状态
        btnHeaderStart.textContent = '▶';
        btnHeaderStart.classList.remove('is-stop');

        btnPick.disabled = false;
        multiModeCheckbox.disabled = false;
        strategySelect.disabled = false;
        maxClicksInput.disabled = false;
        clickIntervalInput.disabled = false;
        missingActionSelect.disabled = false;
        autoFillInput.disabled = false;
        statusDiv.classList.remove('running');
        stateSpan.classList.remove('ac-waiting');
        stateSpan.textContent = '就绪';
    }

    panel.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // ========== 初始化加载 ==========
    loadData();

})();