const imageNavComponent = `
<div class="image-nav-container">
    <div class="image-nav-header">
        <h2>图片处理工具箱</h2>
        <p>一站式图片处理工具，所有功能均在本地完成，保护隐私安全</p>
    </div>
    
    <div class="image-nav-grid">
        <!-- 第一行 -->
        <div class="image-nav-card" onclick="router.navigate('image-processor')">
            <div class="card-icon">⚙️</div>
            <div class="card-title">基础处理</div>
            <div class="card-desc">旋转、翻转、压缩、格式转换</div>
        </div>
        
        <div class="image-nav-card" onclick="router.navigate('image-format')">
            <div class="card-icon">🔄</div>
            <div class="card-title">格式转换</div>
            <div class="card-desc">jpg/png/gif/webp等格式互转</div>
        </div>
        
        <div class="image-nav-card" onclick="router.navigate('image-exif')">
            <div class="card-icon">📝</div>
            <div class="card-title">Exif信息</div>
            <div class="card-desc">查看照片拍摄信息、参数、GPS位置</div>
        </div>
        
        <!-- 第二行 -->
        <div class="image-nav-card" onclick="router.navigate('qrcode-generate')">
            <div class="card-icon">📱</div>
            <div class="card-title">二维码生成</div>
            <div class="card-desc">自定义文字生成二维码，支持多种样式</div>
        </div>
        
        <div class="image-nav-card" onclick="router.navigate('qrcode-parse')">
            <div class="card-icon">🔍</div>
            <div class="card-title">二维码解析</div>
            <div class="card-desc">识别图片中的二维码，提取内容</div>
        </div>
        
        <div class="image-nav-card" onclick="router.navigate('image-pdf')">
            <div class="card-icon">📄</div>
            <div class="card-title">图片转PDF</div>
            <div class="card-desc">单图/多图合并转PDF，自定义尺寸</div>
        </div>
        
        <!-- 第三行 -->
        <div class="image-nav-card" onclick="router.navigate('image-processor')">
            <div class="card-icon">✂️</div>
            <div class="card-title">图片裁剪</div>
            <div class="card-desc">自由裁剪、固定比例裁剪、预设比例</div>
        </div>
        
        <div class="image-nav-card" onclick="router.navigate('image-processor')">
            <div class="card-icon">#️⃣</div>
            <div class="card-title">九宫格切图</div>
            <div class="card-desc">一键切为9张图，发朋友圈神器</div>
        </div>
        
        <div class="image-nav-card" onclick="router.navigate('image-processor')">
            <div class="card-icon">🏷️</div>
            <div class="card-title">加水印</div>
            <div class="card-desc">文字水印、自定义颜色、透明度</div>
        </div>
        
        <!-- 第四行 -->
        <div class="image-nav-card" onclick="router.navigate('image-processor')">
            <div class="card-icon">📝</div>
            <div class="card-title">文字生成图片</div>
            <div class="card-desc">自定义文字内容生成图片</div>
        </div>
        
        <div class="image-nav-card" onclick="router.navigate('image-idphoto')">
            <div class="card-icon">🪪</div>
            <div class="card-title">证件照处理</div>
            <div class="card-desc">换背景、改尺寸、一键生成证件照</div>
        </div>
        
        <div class="image-nav-card" onclick="router.navigate('pdf-to-image')">
            <div class="card-icon">📄</div>
            <div class="card-title">PDF转图片</div>
            <div class="card-desc">将PDF文档转换为图片格式</div>
        </div>
        
        <!-- 第五行 -->
        <div class="image-nav-card" onclick="router.navigate('gif-tools')">
            <div class="card-icon">🎬</div>
            <div class="card-title">GIF工具</div>
            <div class="card-desc">创建GIF、编辑GIF、提取帧</div>
        </div>
        
        <div class="image-nav-card disabled">
            <div class="card-icon">🖼️</div>
            <div class="card-title">图片转SVG</div>
            <div class="card-desc">将位图转换为矢量图形 （开发中）</div>
        </div>
        
        <div class="image-nav-card disabled">
            <div class="card-icon">📦</div>
            <div class="card-title">图片批量处理</div>
            <div class="card-desc">批量压缩、格式转换、添加水印 （开发中）</div>
        </div>
    </div>
</div>
`;