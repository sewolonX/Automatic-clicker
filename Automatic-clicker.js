// ==UserScript==
// @name Automatic-clicker
// @namespace https://github.com/sewolonX/Automatic-clicker
// @version 3.9
// @description 选取页面元素后，以自定义间隔自动连续点击，多重验证确保元素
// @author GLM
// @match *://*/*
// @grant none
// @run-at document-idle
// @downloadURL https://gh-proxy.org/https://github.com/sewolonX/Automatic-clicker/blob/main/Automatic-clicker.js
// @updateURL https://gh-proxy.org/https://github.com/sewolonX/Automatic-clicker/blob/main/Automatic-clicker.js
// ==/UserScript==
(function () {
 'use strict';
 // ========== 状态变量 ==========
 let targetElement = null;
 let targetSelectorStrict = '';
 let targetSelectorLoose = '';
 let targetFingerprint = null;
 let isRunning = false;
 let timerID = null;
 let clickedCount = 0;
 let maxClicks = Infinity;
 let clickInterval = 1100; // 默认间隔1100ms
 let isPicking = false;
 let missingCount = 0;
 let isDarkMode = false; // 亮暗模式状态

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
   width: 280px;
   font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
   font-size: 13px;
   box-shadow: 0 8px 32px rgba(0,0,0,0.5);
   transition: opacity 0.3s;
   overflow: hidden;
 }
 .ac-header {
   display: flex;
   align-items: center;
   justify-content: space-between;
   padding: 14px 12px 10px 18px;
   cursor: move;
   min-height: 44px;
   touch-action: none;
 }
 .ac-header h3 {
   margin: 0;
   font-size: 15px;
   font-weight: 700;
   color: var(--panel-text);
   display: flex;
   align-items: center;
   gap: 8px;
   flex: 1;
   min-width: 0;
   overflow: hidden;
   text-overflow: ellipsis;
   white-space: nowrap;
   pointer-events: none;
 }
 .ac-toggle {
   flex-shrink: 0;
   width: 30px;
   height: 30px;
   background: var(--panel-button-bg);
   border: 1px solid var(--panel-button-border);
   color: var(--panel-button-text);
   font-size: 18px;
   cursor: pointer;
   display: flex;
   align-items: center;
   justify-content: center;
   padding: 0;
   border-radius: 6px;
   margin-left: 8px;
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
 .ac-body {
   padding: 0 18px 18px;
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
   color: var(--panel-label-text);
   margin-bottom: 5px;
   letter-spacing: 0.5px;
 }
 .ac-row input[type="number"], .ac-row select {
   width: 100%;
   background: var(--panel-input-bg);
   border: 1px solid var(--panel-input-border);
   border-radius: 6px;
   color: var(--panel-input-text);
   padding: 7px 10px;
   font-size: 13px;
   outline: none;
   box-sizing: border-box;
   -webkit-appearance: none;
 }
 .ac-row input[type="number"]:focus, .ac-row select:focus {
   border-color: var(--panel-active-border);
 }
 .ac-row input[type="number"]::placeholder {
   color: var(--panel-label-text);
 }
 .ac-row select option {
   background: var(--panel-input-bg);
   color: var(--panel-input-text);
 }
 .ac-target-info {
   background: var(--panel-input-bg);
   border: 1px solid var(--panel-input-border);
   border-radius: 6px;
   padding: 8px 10px;
   font-size: 12px;
   color: var(--panel-label-text);
   word-break: break-all;
   min-height: 34px;
   line-height: 1.5;
   max-height: 150px;
   overflow-y: auto;
 }
 .ac-target-info.active {
   border-color: var(--panel-active-border);
   color: var(--panel-active-text);
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
   border-radius: 8px;
   font-size: 13px;
   font-weight: 600;
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
   color: var(--panel-label-text);
   display: flex;
   justify-content: space-between;
   align-items: center;
 }
 .ac-status .ac-count {
   color: var(--panel-active-text);
   font-weight: 700;
   font-size: 14px;
 }
 .ac-status.running .ac-count {
   animation: ac-pulse 0.8s infinite;
 }
 .ac-status .ac-waiting {
   color: var(--panel-waiting-text);
   font-size: 11px;
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
   width: auto;
   padding: 2px 6px;
   font-size: 11px;
   background: var(--panel-button-bg);
   border: 1px solid var(--panel-button-border);
   color: var(--panel-button-text);
   border-radius: 4px;
   cursor: pointer;
   transition: all 0.2s;
   margin-left: 8px;
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

   // 监听主题变化
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
   <h3>自动点击 ⚔</h3>
   <button class="ac-toggle" title="收起/展开">−</button>
  </div>
  <div class="ac-body">
   <div class="ac-row">
    <label>目标元素 <button class="ac-btn ac-btn-cancel" id="ac-btn-cancel" style="display: none;">清空</button></label>
    <div class="ac-target-info" id="ac-target-info">未选取，请点击下方按钮选取</div>
   </div>
   <div class="ac-row">
    <label>点击次数（留空为无限）</label>
    <input type="number" id="ac-max-clicks" min="1" placeholder="无限次">
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

 if (window.innerWidth < 500) {
   panel.style.left = Math.max(10, (window.innerWidth - 280) / 2) + 'px';
   panel.style.top = '10px';
   panel.style.right = 'auto';
 }

 const targetInfo = document.getElementById('ac-target-info');
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
 const btnCancel = document.getElementById('ac-btn-cancel');

 // ========== 初始化主题检测 ==========
 detectBrowserTheme();

 // ========== 构建选择器基础部分 ==========
 function buildBaseSelector(el) {
   if (el.id) return '#' + CSS.escape(el.id);
   let sel = el.tagName.toLowerCase();
   if (el.className && typeof el.className === 'string') {
     const cls = el.className.trim().split(/\s+/)
     .filter(c => c && !c.startsWith('ac-'))
     .map(c => '.' + CSS.escape(c))
     .join('');
     if (cls) sel += cls;
   }
   return sel;
 }

 // ========== 生成选择器 ==========
 function buildSelectors(el) {
   const base = buildBaseSelector(el);
   if (el.id) return { strict: base, loose: base };
   let strict = base;
   const parent = el.parentElement;
   if (parent) {
     try {
       const sameTagSiblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
       if (sameTagSiblings.length > 1) {
         const idx = sameTagSiblings.indexOf(el) + 1;
         strict += ':nth-of-type(' + idx + ')';
       }
     } catch (e) {
       /* 忽略 */
     }
   }
   return { strict: strict, loose: base };
 }

 // ========== 生成元素指纹 ==========
 function getElementFingerprint(el) {
   const dataAttrs = {};
   const keyAttrs = ['href', 'src', 'value', 'type', 'name', 'role', 'alt', 'title', 'placeholder', 'action', 'method', 'onclick'];
   const attrs = {};
   Array.from(el.attributes).forEach(attr => {
     if (attr.name.startsWith('data-')) {
       dataAttrs[attr.name] = attr.value;
     } else if (keyAttrs.includes(attr.name)) {
       attrs[attr.name] = attr.value;
     }
   });
   // 提取onclick中的关键参数（如useItem(312229)中的312229）
   let onclickParam = '';
   if (attrs.onclick) {
     const match = attrs.onclick.match(/useItem\((\d+)\)/);
     if (match) onclickParam = match[1];
   }
   return {
     tagName: el.tagName.toLowerCase(),
     text: (el.textContent || '').trim(),
     dataAttrs: dataAttrs,
     attrs: attrs,
     onclickParam: onclickParam,
     hasStrong: !!el.id || Object.keys(dataAttrs).length > 0 || keyAttrs.some(k => attrs[k])
   };
 }

 // ========== 指纹验证 ==========
 function matchesFingerprint(el, fp) {
   if (!el || el.tagName.toLowerCase() !== fp.tagName) return false;
   // data-* 必须全部匹配
   for (const [k, v] of Object.entries(fp.dataAttrs)) {
     if (el.getAttribute(k) !== v) return false;
   }
   // 非空关键属性必须匹配
   for (const [k, v] of Object.entries(fp.attrs)) {
     if (v && el.getAttribute(k) !== v) return false;
   }
   // onclick参数必须匹配（区分不同item的关键）
   if (fp.onclickParam) {
     const elOnclick = el.getAttribute('onclick') || '';
     const match = elOnclick.match(/useItem\((\d+)\)/);
     if (match && match[1] !== fp.onclickParam) return false;
   }
   // 文本匹配（有强特征时文本变了也能放过）
   if (fp.text) {
     const elText = (el.textContent || '').trim();
     if (elText !== fp.text && !fp.hasStrong) return false;
   }
   return true;
 }

 // ========== 三级查找 ==========
 function tryFindElement() {
   if (!targetFingerprint) return null;
   function verifyList(list) {
     for (const el of list) {
       if (panel.contains(el)) continue;
       if (matchesFingerprint(el, targetFingerprint)) return el;
     }
     return null;
   }
   try {
     if (targetSelectorStrict) {
       const found = verifyList(document.querySelectorAll(targetSelectorStrict));
       if (found) return found;
     }
     if (targetSelectorLoose) {
       const found = verifyList(document.querySelectorAll(targetSelectorLoose));
       if (found) return found;
     }
     const found = verifyList(document.querySelectorAll(targetFingerprint.tagName));
     if (found) return found;
   } catch (e) {
     /* 选择器异常 */
   }
   return null;
 }

 // ========== 面板拖拽 ==========
 let isDragging = false, dragOffX = 0, dragOffY = 0;
 function getEventPos(e) {
   if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
   return { x: e.clientX, y: e.clientY };
 }
 function onDragStart(e) {
   if (e.target === toggleBtn || toggleBtn.contains(e.target)) return;
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
   let x = pos.x - dragOffX;
   let y = pos.y - dragOffY;
   x = Math.max(0, Math.min(x, window.innerWidth - panel.offsetWidth));
   y = Math.max(0, Math.min(y, window.innerHeight - panel.offsetHeight));
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

 // ========== 收起/展开 ==========
 toggleBtn.addEventListener('click', (e) => {
   e.stopPropagation();
   panel.classList.toggle('collapsed');
   toggleBtn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
 });

 // ========== 选取元素 ==========
 btnPick.addEventListener('click', (e) => {
   e.stopPropagation();
   if (isRunning) return;
   isPicking = !isPicking;
   if (isPicking) {
     btnPick.textContent = '取消选取';
     btnPick.classList.add('picking');
     stateSpan.textContent = '请点击目标元素';
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
   if (targetElement) {
     targetElement.classList.remove('ac-selected-highlight');
   }
   targetElement = el;
   targetElement.classList.remove('ac-highlight');
   targetElement.classList.add('ac-selected-highlight');
   const sels = buildSelectors(el);
   targetSelectorStrict = sels.strict;
   targetSelectorLoose = sels.loose;
   targetFingerprint = getElementFingerprint(el);
   let desc = el.tagName.toLowerCase();
   if (el.id) desc += '#' + el.id;
   if (el.className && typeof el.className === 'string') {
     const cls = el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('ac-')).slice(0, 3).join('.');
     if (cls) desc += '.' + cls;
   }
   const text = el.textContent ? el.textContent.trim() : '';
   if (text) desc += ' "' + text + '"';

   targetInfo.textContent = desc;
   targetInfo.classList.add('active');
   btnStart.disabled = false;
   exitPickMode();
   stateSpan.textContent = '就绪';

   // 显示清空按钮并确保事件监听
   const cancelButton = document.getElementById('ac-btn-cancel');
   if (cancelButton) {
     // 确保按钮可见
     cancelButton.style.display = 'inline-block';

     // 移除可能存在的旧事件监听
     cancelButton.removeEventListener('click', handleCancelClick);

     // 添加新的事件监听
     cancelButton.addEventListener('click', handleCancelClick);
   }
 }

 // 清空按钮点击处理函数
 function handleCancelClick(e) {
   // 阻止事件冒泡，避免触发父元素事件
   e.stopPropagation();

   // 清空选取
   clearSelection();
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

 // ========== 开始/停止 ==========
 btnStart.addEventListener('click', (e) => {
   e.stopPropagation();
   if (!targetElement && !targetSelectorStrict) return;
   if (!isRunning) startClicking();
   else stopClicking();
 });

 function startClicking() {
   if (targetElement && !document.contains(targetElement)) {
     const found = tryFindElement();
     if (found) {
       targetElement = found;
       targetElement.classList.add('ac-selected-highlight');
     }
   }
   // 获取用户自定义的点击间隔
   const intervalValue = clickIntervalInput.value.trim();
   clickInterval = intervalValue ? parseInt(intervalValue, 10) : 1100;
   isRunning = true;
   clickedCount = 0;
   missingCount = 0;
   countSpan.textContent = '0';
   const val = maxClicksInput.value.trim();
   maxClicks = val === '' ? Infinity : parseInt(val, 10) || Infinity;
   btnStart.textContent = '停止';
   btnStart.className = 'ac-btn ac-btn-stop';
   btnPick.disabled = true;
   maxClicksInput.disabled = true;
   clickIntervalInput.disabled = true;
   missingActionSelect.disabled = true;
   statusDiv.classList.add('running');
   stateSpan.textContent = '运行中';
   stateSpan.classList.remove('ac-waiting');
   doClick();
   timerID = setInterval(doClick, clickInterval);
 }

 function doClick() {
   if (!document.contains(targetElement)) {
     const found = tryFindElement();
     if (found) {
       targetElement = found;
       targetElement.classList.add('ac-selected-highlight');
       missingCount = 0;
       stateSpan.textContent = '运行中';
       stateSpan.classList.remove('ac-waiting');
     } else {
       missingCount++;
       if (missingActionSelect.value === 'stop') {
         stopClicking();
         stateSpan.textContent = '元素已消失';
         stateSpan.classList.remove('ac-waiting');
         return;
       }
       stateSpan.textContent = '等待元素中...(' + missingCount + ')';
       stateSpan.classList.add('ac-waiting');
       return;
     }
   } else {
     if (!matchesFingerprint(targetElement, targetFingerprint)) {
       const found = tryFindElement();
       if (found && found !== targetElement) {
         targetElement.classList.remove('ac-selected-highlight');
         targetElement = found;
         targetElement.classList.add('ac-selected-highlight');
         missingCount = 0;
       } else if (!found) {
         missingCount++;
         if (missingActionSelect.value === 'stop') {
           stopClicking();
           stateSpan.textContent = '元素已失效';
           stateSpan.classList.remove('ac-waiting');
           return;
         }
         stateSpan.textContent = '等待元素中...(' + missingCount + ')';
         stateSpan.classList.add('ac-waiting');
         return;
       }
     }
   }

   targetElement.click();
   clickedCount++;
   countSpan.textContent = clickedCount;
   missingCount = 0;
   stateSpan.textContent = '运行中';
   stateSpan.classList.remove('ac-waiting');
   if (clickedCount >= maxClicks) {
     stopClicking();
     stateSpan.textContent = '已完成';
   }
 }

 function stopClicking() {
   isRunning = false;
   clearInterval(timerID);
   timerID = null;
   btnStart.textContent = '开始';
   btnStart.className = 'ac-btn ac-btn-start';
   btnPick.disabled = false;
   maxClicksInput.disabled = false;
   clickIntervalInput.disabled = false;
   missingActionSelect.disabled = false;
   statusDiv.classList.remove('running');
   stateSpan.classList.remove('ac-waiting');
   if (stateSpan.textContent === '运行中') {
     stateSpan.textContent = '已停止';
   }
 }

 // 清空选取的元素 只有清空按钮调用
 function clearSelection() {
   if (targetElement) {
     targetElement.classList.remove('ac-selected-highlight');
     targetElement = null;
   }
   targetSelectorStrict = '';
   targetSelectorLoose = '';
   targetFingerprint = null;
   targetInfo.textContent = '未选取，请点击下方按钮选取';
   targetInfo.classList.remove('active');
   btnStart.disabled = true;

   // 隐藏清空按钮
   const cancelButton = document.getElementById('ac-btn-cancel');
   if (cancelButton) {
     cancelButton.style.display = 'none';
   }
 }

 panel.addEventListener('click', (e) => {
   e.stopPropagation();
 });
})();
