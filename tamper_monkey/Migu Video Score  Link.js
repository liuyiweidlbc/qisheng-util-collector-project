// ==UserScript==
// @name         Migu回放进球定位
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Migu video 进球快速跳转和自动播放全场回放
// @author       You
// @match        *://*.miguvideo.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Global variables
    let timeOffset = 15;
    let timeOffsetInputElement = null;
    let isScoreVisible = true;
    let isTimeOffsetVisible = true;
    let retryCount = 0;
    const maxRetries = 10;
    let fullMatchReplayClicked = false;
    // 添加时间偏移自动隐藏相关变量
    let timeOffsetHideTimer = null;
    const timeOffsetHideDelay = 7000; // 7秒后自动隐藏

    // Function to find and click the full match replay button
    function clickFullMatchReplay() {
        if (fullMatchReplayClicked) {
            console.log('全场回放已经被点击，不再尝试');
            return;
        }

        console.log('尝试查找全场回放按钮...');

        // 使用更通用的选择器
        const selectors = [
            // 使用 title 属性包含"全场回放"的元素
            () => document.querySelector('div[title*="全场回放"]'),
            // 使用 class 为 "introduce" 且内容包含"全场回放"的元素
            () => Array.from(document.querySelectorAll('.introduce')).find(el => el.textContent.includes('全场回放')),
            // 使用更通用的属性选择器
            () => document.querySelector('div[class*="review-list-item"]'),
            // 查找包含"全场回放"文本的任何元素
            () => Array.from(document.querySelectorAll('*')).find(el => el.textContent.trim() === '全场回放')
        ];

        // 尝试每个选择器直到找到匹配的元素
        let targetElement;
        for (const selector of selectors) {
            targetElement = selector();
            if (targetElement) break;
        }

        if (targetElement) {
            console.log('找到全场回放元素:', targetElement);
            // 模拟点击事件
            targetElement.click();
            // 如果简单的 click() 不起作用，可以尝试创建一个鼠标事件
            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            targetElement.dispatchEvent(clickEvent);
            console.log('已尝试点击全场回放');
            fullMatchReplayClicked = true;
        } else {
            console.log('未找到全场回放元素，重试中...');
            if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(clickFullMatchReplay, 2000);
            } else {
                console.log('达到最大重试次数，无法找到全场回放元素');
            }
        }
    }

    // Global keyboard event listener
    function setupKeyboardListener() {
        document.removeEventListener('keydown', handleKeyDown);
        document.addEventListener('keydown', handleKeyDown);
    }

    // 重置时间偏移隐藏计时器
    function resetTimeOffsetHideTimer() {
        // 清除现有计时器
        if (timeOffsetHideTimer) {
            clearTimeout(timeOffsetHideTimer);
        }

        // 设置新计时器
        timeOffsetHideTimer = setTimeout(() => {
            isTimeOffsetVisible = false;
            toggleTimeOffsetVisibility(false);
        }, timeOffsetHideDelay);
    }

    // Keyboard event handler
    function handleKeyDown(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            isScoreVisible = !isScoreVisible;
            toggleScoreVisibility(isScoreVisible);
        }
        else if (e.ctrlKey) {
            e.preventDefault();
            isTimeOffsetVisible = !isTimeOffsetVisible;
            toggleTimeOffsetVisibility(isTimeOffsetVisible);
        }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // 显示时间偏移控件
            if (!isTimeOffsetVisible) {
                isTimeOffsetVisible = true;
                toggleTimeOffsetVisibility(true);
            }

            // 重置自动隐藏计时器
            resetTimeOffsetHideTimer();

            if (e.key === 'ArrowUp') {
                timeOffset += 1;
                if (timeOffsetInputElement) {
                    timeOffsetInputElement.textContent = timeOffset;
                }
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                timeOffset = Math.max(0, timeOffset - 1);
                if (timeOffsetInputElement) {
                    timeOffsetInputElement.textContent = timeOffset;
                }
                e.preventDefault();
            }
        }
    }

    // Toggle score visibility
    function toggleScoreVisibility(isVisible) {
        const homeOverlay = document.getElementById('score-overlay-home');
        const guestOverlay = document.getElementById('score-overlay-guest');
        if (homeOverlay) homeOverlay.style.display = isVisible ? 'flex' : 'none';
        if (guestOverlay) guestOverlay.style.display = isVisible ? 'flex' : 'none';
    }

    // Toggle time offset visibility
    function toggleTimeOffsetVisibility(isVisible) {
        const timeOffsetContainer = document.getElementById('time-offset-container');
        if (timeOffsetContainer) timeOffsetContainer.style.display = isVisible ? 'flex' : 'none';
    }

    // Create time offset input
    function createTimeOffsetInput() {
        const container = document.createElement('div');
        container.id = 'time-offset-container';
        Object.assign(container.style, {
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '14px',
            zIndex: '9999',
            display: 'flex',
            flexDirection: 'row',
            gap: '4px',
            alignItems: 'center'
        });

        const label = document.createElement('div');
        label.textContent = '时间偏移';
        Object.assign(label.style, {
            fontSize: '12px'
        });

        const input = document.createElement('div');
        input.textContent = timeOffset;
        Object.assign(input.style, {
            textAlign: 'center',
            padding: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '2px'
        });

        container.appendChild(label);
        container.appendChild(input);
        timeOffsetInputElement = input;
        return container;
    }

    // Create score overlay
    function createScoreOverlay(position) {
        const overlay = document.createElement('div');
        overlay.id = `score-overlay-${position}`;
        Object.assign(overlay.style, {
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            [position === 'home' ? 'left' : 'right']: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: position === 'home' ? '#FFB366' : '#66B2FF',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: 'bold',
            zIndex: '9999',
            pointerEvents: 'auto',
            display: 'none',
            flexDirection: 'column',
            gap: '8px',
            cursor: 'pointer'
        });

        return overlay;
    }

    // Calculate video time from match minute
    function calculateVideoTime(matchMinute) {
        const minute = parseInt(matchMinute, 10);
        if (isNaN(minute)) return null;

        const adjustedMinute = minute <= 45 ?
            minute + timeOffset :
            minute + timeOffset + 15;
        return adjustedMinute * 60;
    }

    // Jump to specific time in video
    function jumpToVideoTime(seconds) {
        const videoElement = document.querySelector('video');
        if (videoElement && !isNaN(seconds)) {
            videoElement.currentTime = seconds;
        }
    }

    // Find video container and add overlays
    function addOverlaysToVideo() {
        const videoElement = document.querySelector('video');
        if (videoElement) {
            const videoContainer = videoElement.parentElement;
            if (videoContainer) {
                if (getComputedStyle(videoContainer).position === 'static') {
                    videoContainer.style.position = 'relative';
                }

                const existingHomeOverlay = document.getElementById('score-overlay-home');
                const existingGuestOverlay = document.getElementById('score-overlay-guest');
                const existingOffsetInput = document.getElementById('time-offset-container');

                if (existingHomeOverlay) existingHomeOverlay.remove();
                if (existingGuestOverlay) existingGuestOverlay.remove();
                if (existingOffsetInput) existingOffsetInput.remove();

                const homeOverlay = createScoreOverlay('home');
                const guestOverlay = createScoreOverlay('guest');
                const offsetInput = createTimeOffsetInput();

                videoContainer.appendChild(homeOverlay);
                videoContainer.appendChild(guestOverlay);
                videoContainer.appendChild(offsetInput);

                return { homeOverlay, guestOverlay };
            }
        }
        return null;
    }

    // Check if player info has goal icons
    function hasGoalIcon(playerInfoDiv) {
        if (!playerInfoDiv) return false;
        const goalIconClasses = ['.icon.gold', '.icon.dqw-gold', '.icon.wl-gold'];
        return goalIconClasses.some(className =>
            playerInfoDiv.querySelector(className) !== null
        );
    }

    // Get goal details
    function getGoalDetails(scoreElement) {
        const playerInfoDiv = scoreElement.parentElement.querySelector('.player-info');
        const playerNameElement = playerInfoDiv?.querySelector('.player-name');
        const timeNumElement = scoreElement.parentElement.parentElement.querySelector('.time-num');
        const timeNumParent = timeNumElement?.parentElement?.parentElement;
        const isHome = timeNumParent?.classList.contains('home');
        const isGuest = timeNumParent?.classList.contains('guest');

        let time = timeNumElement ? timeNumElement.textContent.trim() : '';
        if (time && !time.includes("'")) {
            time += "'";
        }

        const scoreSpan = scoreElement.querySelector('span');
        const score = scoreSpan ? scoreSpan.textContent.trim().replace(/\s+/g, '') : '';

        return {
            playerName: playerNameElement ? playerNameElement.textContent.trim() : '',
            time: time,
            score: score,
            teamType: isHome ? 'home' : isGuest ? 'guest' : null
        };
    }

    // Create score entry
    function createScoreEntry(score, playerName, time) {
        const entryDiv = document.createElement('div');
        entryDiv.style.display = 'flex';
        entryDiv.style.flexDirection = 'column';
        entryDiv.style.gap = '4px';
        entryDiv.style.alignItems = 'flex-start';

        const scoreTimeDiv = document.createElement('div');
        scoreTimeDiv.textContent = `${score}  ${time}`;
        scoreTimeDiv.style.cursor = 'pointer';
        scoreTimeDiv.style.fontSize = '16px';
        scoreTimeDiv.style.fontWeight = 'bold';

        scoreTimeDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            const matchMinute = time.replace(/\D/g, '');
            const videoTime = calculateVideoTime(matchMinute);
            if (videoTime !== null) {
                jumpToVideoTime(videoTime);
            }
        });

        entryDiv.appendChild(scoreTimeDiv);

        if (playerName) {
            const playerNameDiv = document.createElement('div');
            const shortName = playerName.length > 7 ? playerName.slice(0, 7) + '...' : playerName;
            playerNameDiv.textContent = shortName;
            playerNameDiv.title = playerName;
            playerNameDiv.style.cursor = 'pointer';
            playerNameDiv.style.fontSize = '14px';
            playerNameDiv.style.fontWeight = 'normal';

            playerNameDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                const matchMinute = time.replace(/\D/g, '');
                const videoTime = calculateVideoTime(matchMinute);
                if (videoTime !== null) {
                    jumpToVideoTime(videoTime);
                }
            });

            entryDiv.appendChild(playerNameDiv);
        }

        return entryDiv;
    }

    // Update score
    function updateScore() {
        const scoreElements = document.querySelectorAll('.current-score');
        const overlays = addOverlaysToVideo();

        if (overlays) {
            const { homeOverlay, guestOverlay } = overlays;
            let hasHomeScore = false;
            let hasGuestScore = false;

            homeOverlay.innerHTML = '';
            guestOverlay.innerHTML = '';

            scoreElements.forEach(scoreElement => {
                const playerInfoDiv = scoreElement.parentElement.querySelector('.player-info');

                if (hasGoalIcon(playerInfoDiv)) {
                    const scoreSpan = scoreElement.querySelector('span');
                    if (scoreSpan) {
                        const score = scoreSpan.textContent.trim().replace(/\s+/g, '');
                        if (score && score !== '0:0') {
                            const { playerName, time, teamType } = getGoalDetails(scoreElement);
                            if (teamType) {
                                const scoreEntry = createScoreEntry(score, playerName, time);
                                if (teamType === 'home') {
                                    homeOverlay.appendChild(scoreEntry);
                                    hasHomeScore = true;
                                } else {
                                    guestOverlay.appendChild(scoreEntry);
                                    hasGuestScore = true;
                                }
                            }
                        }
                    }
                }
            });

            homeOverlay.style.display = (hasHomeScore && isScoreVisible) ? 'flex' : 'none';
            guestOverlay.style.display = (hasGuestScore && isScoreVisible) ? 'flex' : 'none';
        }
    }

    // Watch for video element changes
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                if (!document.getElementById('score-overlay-home') || !document.getElementById('score-overlay-guest')) {
                    addOverlaysToVideo();
                    updateScore();
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Initialize
    function initialize() {
        console.log('初始化脚本');
        setupKeyboardListener();

        // 延迟执行clickFullMatchReplay，给页面更多时间加载
        setTimeout(() => {
            console.log('尝试点击全场回放');
            clickFullMatchReplay();
        }, 3000); // 3秒延迟

        addOverlaysToVideo();
        updateScore();

        // 初始显示时间偏移控件，并设置自动隐藏计时器
        isTimeOffsetVisible = true;
        toggleTimeOffsetVisibility(true);
        resetTimeOffsetHideTimer();
    }

    // 确保在页面加载完成后运行初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // 如果页面已经加载完成，立即运行初始化
        initialize();
    }

    // Update scores periodically
    setInterval(updateScore, 5000);

})();