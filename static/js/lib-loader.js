/**
 * 大体积第三方库的按需加载器。
 *
 * 首屏只解析应用自身的脚本；pdf.js（约 320 KB）、jsQR（约 130 KB）、crypto-js、
 * Sortable、EXIF、qrcode 这些库只在对应功能真正触发时才下载执行，省掉每次启动
 * 都要解析数百 KB 用不到的代码。加载过的库会一直留在页面里，重复调用直接命中
 * 已缓存的 Promise。
 *
 * 用法：await ITLibs.load('pdfjs')
 *
 * 注意：这里插入的 <script> 不打 data-route-script 标记，
 * router.unloadRouteScripts() 切换路由时不会移除它们。
 */
(function () {
    'use strict';

    var LIBS = {
        pdfjs: {
            src: '/static/lib/pdf.min.js',
            // pdf.js 的 worker 地址必须在主库执行后设置
            after: function () {
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/lib/pdf.worker.min.js';
                }
            }
        },
        jsqr: { src: '/static/lib/jsQR.min.js' },
        crypto: { src: '/static/lib/crypto-js.min.js' },
        exif: { src: '/static/lib/exif.min.js' },
        qrcode: { src: '/static/lib/qrcode.min.js' },
        sortable: { src: '/static/lib/Sortable.min.js' },
        // gif.js 的 worker 路径写死在调用处（/static/lib/gif.worker.js）
        gif: { src: '/static/lib/gif.js' }
    };

    var pending = {};

    function load(name) {
        var lib = LIBS[name];
        if (!lib) {
            return Promise.reject(new Error('未知的库: ' + name));
        }
        if (pending[name]) {
            return pending[name];
        }

        pending[name] = new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = lib.src;
            script.async = true;
            script.onload = function () {
                if (typeof lib.after === 'function') {
                    try {
                        lib.after();
                    } catch (error) {
                        console.error('初始化 ' + name + ' 失败:', error);
                    }
                }
                resolve();
            };
            script.onerror = function () {
                // 失败后清掉缓存，允许下次重新尝试
                delete pending[name];
                reject(new Error('加载失败: ' + lib.src));
            };
            document.head.appendChild(script);
        });

        return pending[name];
    }

    window.ITLibs = {
        load: load,
        ensure: load
    };
})();
