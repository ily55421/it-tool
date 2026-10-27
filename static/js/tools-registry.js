// 工具注册表 —— 应用中心与顶栏的唯一数据来源。
// 新增工具：在 TOOLS 里加一条（route 必须与 router.js 的路由一致），图标从 ICONS 取或新增一段 path。

(function (global) {
    const ICONS = {
        // 文档
        merge: '<rect x="8" y="3" width="12" height="14" rx="2"/><path d="M5 7v12a2 2 0 0 0 2 2h9"/><path d="M14 7v6"/><path d="m11.5 10.5 2.5 2.5 2.5-2.5"/>',
        scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="m14.47 14.48 5.53 5.52"/><path d="M8.12 8.12 12 12"/>',
        'file-text': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
        // 图片
        wand: '<path d="m3 21 9.5-9.5"/><path d="M15 4.5V2"/><path d="M15 11.5v-2"/><path d="M11.5 7.5h-2"/><path d="M19.5 7.5h-2"/><path d="m18.2 4.3-1.4 1.4"/><path d="m13.2 9.3-1.4 1.4"/><path d="m18.2 10.7-1.4-1.4"/><path d="m13.2 5.7-1.4-1.4"/>',
        'image-frame': '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9.5" r="1.6"/><path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L16 17"/><path d="m14 14 1.8-1.8a2 2 0 0 1 2.8 0L20 13"/>',
        'rotate-format': '<path d="M4 9a7 7 0 0 1 11.5-5.3L18 6"/><path d="M18 3v3.5h-3.5"/><path d="M20 15a7 7 0 0 1-11.5 5.3L6 18"/><path d="M6 21v-3.5h3.5"/>',
        'exif-tag': '<path d="M4 5h9.2a2 2 0 0 1 1.4.6l5.4 5.4a2 2 0 0 1 0 2.8l-6.4 6.4a2 2 0 0 1-2.8 0l-5.4-5.4A2 2 0 0 1 4 13.4z" transform="translate(0 1)"/><circle cx="8.5" cy="10" r="1.4"/>',
        'id-badge': '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.8 16c.6-1.5 1.6-2.2 2.7-2.2s2.1.7 2.7 2.2"/><path d="M14 10h4"/><path d="M14 13.5h4"/>',
        qrcode: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14v3"/><path d="M14 20h3"/><path d="M20 20h1"/>',
        'qrcode-scan': '<path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M16 4h3a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1v-3"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M11 9v6"/>',
        film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16"/><path d="M16 4v16"/><path d="M3 9h5"/><path d="M3 15h5"/><path d="M16 9h5"/><path d="M16 15h5"/>',
        'pdf-to-image': '<path d="M14 3H7a2 2 0 0 0-2 2v6"/><path d="M14 3v5h5"/><rect x="9" y="12" width="12" height="9" rx="2"/><circle cx="12.8" cy="15.2" r="1.2"/><path d="m10.5 20 3-3 2.4 2.4"/>',
        'image-to-pdf': '<rect x="3" y="4" width="12" height="12" rx="2"/><circle cx="6.8" cy="8" r="1.2"/><path d="m4 14 3.4-3.4a2 2 0 0 1 2.8 0L13 13"/><path d="M15 9h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2"/>',
        // 文本
        'chart-bar': '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
        hash: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>',
        key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.4-8.4"/><path d="M17 6.2 19.4 8.6"/><path d="M14 9.2 16.4 11.6"/>',
        diff: '<path d="M12 3v18"/><path d="M5 8H2"/><path d="M8 5v6"/><path d="M19 16h-3"/><path d="M17 13v6"/>',
        // JSON
        braces: '<path d="M8 3a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2"/><path d="M16 3a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2"/>',
        tree: '<rect x="9" y="2.5" width="6" height="4.5" rx="1.2"/><rect x="2.5" y="17" width="6" height="4.5" rx="1.2"/><rect x="15.5" y="17" width="6" height="4.5" rx="1.2"/><path d="M12 7v4"/><path d="M5.5 17v-3a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v3"/>',
        code: '<path d="m8 8-5 4 5 4"/><path d="m16 8 5 4-5 4"/><path d="m13.5 5-3 14"/>',
        exchange: '<path d="M3 8h14"/><path d="m14 5 3 3-3 3"/><path d="M21 16H7"/><path d="m10 13-3 3 3 3"/>',
        // 加密安全
        lock: '<rect x="4" y="10" width="16" height="11" rx="2.4"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/><path d="M12 14.5v2.5"/>',
        shield: '<path d="M12 3 4.5 6v6c0 4.2 3 7.4 7.5 9 4.5-1.6 7.5-4.8 7.5-9V6z"/><path d="m9.2 12.2 2 2 3.8-4"/>',
        signature: '<path d="M3 17c2.6 0 3.4-8 5.6-8 1.6 0 1.4 5 3 5 1.4 0 1.6-2.4 3-2.4 1.2 0 1.6 1.6 3.4 1.6"/><path d="M21 17c-2 1-4.6 2.4-8.6 2.4C8.4 19.4 5 18 3 17"/><path d="M17 6h4"/>',
        seed: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M6.5 7.5c2 1.4 3.5 2 5.5 2s3.5-.6 5.5-2"/><path d="M6.5 16.5c2-1.4 3.5-2 5.5-2s3.5.6 5.5 2"/>',
        // ID
        fingerprint: '<path d="M12 3a9 9 0 0 0-9 9"/><path d="M21 12a9 9 0 0 0-9-9"/><path d="M7.5 12A4.5 4.5 0 0 1 12 7.5 4.5 4.5 0 0 1 16.5 12v2"/><path d="M12 12v3.5a2.5 2.5 0 0 1-2.5 2.5"/><path d="M12 20.5V16"/><path d="M16.5 16a4.5 4.5 0 0 1-1.6 3.1"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
        // 开发速查
        git: '<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><circle cx="18" cy="12" r="2.6"/><path d="M6 8.6v6.8"/><path d="M15.4 12H9.6a3.6 3.6 0 0 1-3.6-3.6"/>',
        terminal: '<rect x="2.5" y="4" width="19" height="16" rx="2.4"/><path d="m7 10 2.6 2L7 16"/><path d="M12.5 16h4.5"/>',
        // 其他
        boolean: '<rect x="13" y="4" width="8" height="16" rx="4"/><path d="M19 8h-4"/><circle cx="16.6" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M2.5 9h5"/><path d="M2.5 15h5"/><path d="M4 6.5h2"/><path d="M5 9v6"/>',
        link: '<path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.4 6.4"/><path d="M14 10.5a4 4 0 0 0-5.7 0L5.5 13.3a4 4 0 0 0 5.7 5.7l1.4-1.4"/>'
    };

    // 顶栏 / 分类页脚用的通用图标（不属于某个工具）
    const UI_ICONS = {
        grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4.4-4.4"/>',
        close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
        back: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
        palette: '<path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-1 1.6-2.2-.5-1.4.6-2.8 2.2-2.8h1.4A3.8 3.8 0 0 0 21 12.2 9 9 0 0 0 12 3Z"/><circle cx="7.8" cy="11" r="1.2" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.4" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.2" cy="7.6" r="1.2" fill="currentColor" stroke="none"/>'
    };

    const CATEGORIES = [
        { id: 'pdf', name: 'PDF 与文档', icon: 'file-text', a: '#2f7fe8', b: '#1850d2' },
        { id: 'image', name: '图片处理', icon: 'palette', a: '#12b5a8', b: '#0b8f86' },
        { id: 'text', name: '文本处理', icon: 'chart-bar', a: '#7c5cf3', b: '#5b3fd6' },
        { id: 'json', name: 'JSON 工具', icon: 'braces', a: '#f59e0b', b: '#d97706' },
        { id: 'security', name: '加密安全', icon: 'shield', a: '#e0447c', b: '#bd2a61' },
        { id: 'id', name: 'ID 生成', icon: 'fingerprint', a: '#0ea5e9', b: '#0369a1' },
        { id: 'dev', name: '开发速查', icon: 'terminal', a: '#10a37f', b: '#0b7a5e' },
        { id: 'other', name: '其他工具', icon: 'grid', a: '#64748b', b: '#475569' }
    ];

    const TOOLS = [
        { route: '/pdf-merge', cat: 'pdf', name: 'PDF 合并', desc: '多文件排序预览后合并', icon: 'merge', tags: '合并 merge 拼接' },
        { route: '/split-pdf', cat: 'pdf', name: 'PDF 拆分', desc: '按页拆分，支持 MOBI/EPUB', icon: 'scissors', tags: '拆分 split 电子书 mobi epub' },
        { route: '/md-to-word', cat: 'pdf', name: 'Markdown 转 Word', desc: '生成 docx 文档', icon: 'file-text', tags: 'word docx 文档 markdown' },

        { route: '/image-processor', cat: 'image', name: '图片基础处理', desc: '旋转 / 裁剪 / 压缩 / 九宫格', icon: 'wand', tags: '裁剪 压缩 旋转 缩放 九宫格 resize' },
        { route: '/image-format', cat: 'image', name: '图片格式转换', desc: 'jpg / png / gif / webp 互转', icon: 'rotate-format', tags: '格式 转换 webp png jpg' },
        { route: '/image-exif', cat: 'image', name: 'Exif 信息', desc: '查看拍摄参数与位置', icon: 'exif-tag', tags: 'exif 元数据 参数 gps 光圈' },
        { route: '/image-idphoto', cat: 'image', name: '证件照处理', desc: '换底色并按规格排版', icon: 'id-badge', tags: '证件照 蓝底 红底 报名 一寸' },
        { route: '/qrcode-generate', cat: 'image', name: '二维码生成', desc: '文本转二维码并导出', icon: 'qrcode', tags: '二维码 qrcode 链接 文本' },
        { route: '/qrcode-parse', cat: 'image', name: '二维码解析', desc: '识别图片中的二维码', icon: 'qrcode-scan', tags: '二维码 解析 识别 decode' },
        { route: '/gif-tools', cat: 'image', name: 'GIF 工具', desc: '合成、预览与优化', icon: 'film', tags: 'gif 动图 合成 压缩' },
        { route: '/pdf-to-image', cat: 'image', name: 'PDF 转图片', desc: '逐页导出 png / jpg', icon: 'pdf-to-image', tags: 'pdf 导出 图片 png 截图' },
        { route: '/image-to-pdf', cat: 'image', name: '图片转 PDF', desc: '旋转调整后合成 PDF', icon: 'image-to-pdf', tags: '图片 pdf 扫描 转换' },

        { route: '/text-stats', cat: 'text', name: '文本统计', desc: '字符 / 行 / 单词 / 字节数', icon: 'chart-bar', tags: '统计 字数 行数 字节' },
        { route: '/hash-text', cat: 'text', name: '文本哈希', desc: 'MD5 / SHA1 / SHA256 / 512', icon: 'hash', tags: '哈希 md5 sha 摘要 校验' },
        { route: '/token-gen', cat: 'text', name: 'Token 生成器', desc: '随机串，可选长度与字符集', icon: 'key', tags: 'token 随机 密码 字符串' },
        { route: '/diff', cat: 'text', name: '文本差异对比', desc: '双栏对比增删改', icon: 'diff', tags: 'diff 对比 差异 版本' },

        { route: '/json-formatter', cat: 'json', name: 'JSON 格式化', desc: '缩进、校验与压缩', icon: 'braces', tags: 'json 格式化 美化 压缩' },
        { route: '/json-vision', cat: 'json', name: 'JSON 可视化', desc: '树形结构浏览', icon: 'tree', tags: 'json 树 结构 可视化' },
        { route: '/json-tool', cat: 'json', name: 'JSON 序列化', desc: '字符串转标准 JSON', icon: 'code', tags: 'json 序列化 解析 escape' },
        { route: '/json-yaml', cat: 'json', name: 'JSON ⇄ YAML', desc: '两种配置格式互转', icon: 'exchange', tags: 'yaml 转换 配置' },

        { route: '/bcrypt', cat: 'security', name: 'Bcrypt 加密', desc: '可调轮数的密码哈希', icon: 'lock', tags: 'bcrypt 密码 哈希' },
        { route: '/encrypt', cat: 'security', name: 'AES 加解密', desc: '对称加密与解密', icon: 'shield', tags: 'aes 加密 解密 对称' },
        { route: '/hmac', cat: 'security', name: 'HMAC 生成器', desc: '带密钥的哈希签名', icon: 'signature', tags: 'hmac 签名 密钥' },
        { route: '/bip39', cat: 'security', name: 'BIP39 助记词', desc: '钱包助记词生成', icon: 'seed', tags: 'bip39 助记词 钱包 种子' },

        { route: '/uuid', cat: 'id', name: 'UUID 生成器', desc: 'v1 / v4，支持批量', icon: 'fingerprint', tags: 'uuid guid 唯一标识' },
        { route: '/ulid', cat: 'id', name: 'ULID 生成器', desc: '可排序的唯一标识', icon: 'clock', tags: 'ulid 时间戳 排序' },

        { route: '/git-tools', cat: 'dev', name: 'Git 命令速查', desc: '分支 / 提交 / 合并常用命令', icon: 'git', tags: 'git 命令 commit branch merge 备忘' },
        { route: '/finalshell', cat: 'dev', name: 'FinalShell 激活码', desc: '按机器码生成本地授权码', icon: 'terminal', tags: 'finalshell 机器码 授权 激活' },

        { route: '/boolean', cat: 'other', name: '布尔值计算', desc: 'and / or / not 求值', icon: 'boolean', tags: '布尔 and or not 逻辑' },
        { route: '/url-params', cat: 'other', name: 'URL 参数', desc: '解析与构建查询串', icon: 'link', tags: 'url query 参数 接口' }
    ];

    function svg(paths, cls) {
        return '<svg class="' + (cls || 'ac-svg') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            + 'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
    }

    function toolIcon(tool) {
        return svg(ICONS[tool.icon] || ICONS.grid);
    }

    function categoryIcon(category) {
        const paths = ICONS[category.icon] || UI_ICONS[category.icon];
        return svg(paths || UI_ICONS.grid);
    }

    function categoryById(id) {
        return CATEGORIES.find(function (c) { return c.id === id; }) || null;
    }

    function toolByRoute(route) {
        return TOOLS.find(function (t) { return t.route === route; }) || null;
    }

    function toolsByCategory(id) {
        return TOOLS.filter(function (t) { return t.cat === id; });
    }

    global.ITToolset = {
        CATEGORIES: CATEGORIES,
        TOOLS: TOOLS,
        UI_ICONS: UI_ICONS,
        svg: svg,
        toolIcon: toolIcon,
        categoryIcon: categoryIcon,
        categoryById: categoryById,
        toolByRoute: toolByRoute,
        toolsByCategory: toolsByCategory
    };
})(window);
