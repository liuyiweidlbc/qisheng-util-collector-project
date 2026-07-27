
// ==UserScript==
// @name         500彩票网广告删除
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  删除500彩票网分析页面中的特定广告图片行和轮播图
// @author       YourName
// @match        https://odds.500.com/fenxi/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 配置参数
    const config = {
        // 要删除的表格行图片
        tableRowImg: "https://tradeimg.500.com/upimages/wap/img/20250523175956500.png",
        // 要删除的轮播图图片
        bannerImg: "https://tradeimg.500.com/upimages/wap/img/20250523171952490.png",
        // 检查间隔(毫秒)
        checkInterval: 1000
    };

    // 删除包含目标图片的表格行
    function removeTableRows() {
        const images = document.querySelectorAll(`img[src="${config.tableRowImg}"]`);
        images.forEach(img => {
            const row = img.closest('tr');
            if (row) row.remove();
        });
    }

    // 删除包含目标图片的轮播图容器
    function removeBannerContainer() {
        const targetImg = document.querySelector(`img.yunying-ad-banner[src="${config.bannerImg}"]`);
        if (targetImg) {
            const container = targetImg.closest('div.swiper-container.pc_odds_fenxi_banner');
            if (container) container.remove();
        }
    }

    // 执行删除操作
    function executeRemoval() {
        removeTableRows();
        removeBannerContainer();
    }

    // 页面加载完成后执行
    window.addEventListener('load', function() {
        executeRemoval();
        // 定时检查动态加载内容
        setInterval(executeRemoval, config.checkInterval);
    });
})();
