var MDToDocxApp = class MDToDocxApp {
    constructor() {
        this.currentFileId = null;
        this.init();
    }

    init() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const mdEditor = document.getElementById('mdEditor');
        const convertBtn = document.getElementById('convertBtn');
        const resetBtn = document.getElementById('resetBtn');
        const sampleBtn = document.getElementById('loadSampleBtn');

        uploadArea.addEventListener('click', () => fileInput.click());
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const ext = files[0].name.toLowerCase().split('.').pop();
                if (['md', 'txt'].includes(ext)) {
                    this.uploadFile(files[0]);
                } else {
                    alert('请上传 .md 或 .txt 文件');
                }
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.uploadFile(e.target.files[0]);
            }
        });

        convertBtn.addEventListener('click', () => this.convertToDocx());
        resetBtn.addEventListener('click', () => this.resetAll());
        sampleBtn.addEventListener('click', () => this.loadSampleContent());

        this.updateCharCount();
        mdEditor.addEventListener('input', () => this.updateCharCount());
    }

    updateCharCount() {
        const editor = document.getElementById('mdEditor');
        const charCount = document.getElementById('charCount');
        const wordCount = document.getElementById('wordCount');
        
        const text = editor.value;
        charCount.textContent = text.length;
        wordCount.textContent = text.replace(/\s+/g, ' ').trim().split(' ').filter(w => w).length;
    }

    loadSampleContent() {
        const sample = `# Markdown 转 Word 示例

欢迎使用 Markdown 转 Word 工具！

## 功能特点

- 支持 Markdown 语法转换
- 支持表格、列表、代码块
- 自动处理中文排版
- 保持原有的格式结构

## 支持的 Markdown 语法

### 1. 标题

使用 \`#\` 符号创建标题：

\`\`\`
# 一级标题
## 二级标题
### 三级标题
\`\`\`

### 2. 列表

**无序列表：**
- 项目一
- 项目二
- 项目三

**有序列表：**
1. 第一步
2. 第二步
3. 第三步

### 3. 表格

| 功能 | 描述 | 状态 |
|------|------|------|
| PDF 合并 | 合并多个 PDF 文件 | ✅ 已完成 |
| 图片转 PDF | 将图片转换为 PDF | ✅ 已完成 |
| PDF 拆分 | 拆分 PDF 文件 | ✅ 已完成 |
| MD 转 Word | Markdown 转 Word | 🚀 开发中 |

### 4. 引用

> 这是一段引用文本。
> 
> —— 作者

### 5. 代码块

\`\`\`python
def hello_world():
    print("Hello, World!")

if __name__ == "__main__":
    hello_world()
\`\`\`

## 使用说明

1. **上传文件**：点击或拖拽 Markdown 文件到上传区域
2. **编辑内容**：在编辑器中查看或修改内容
3. **转换文档**：点击转换按钮生成 Word 文档
4. **下载结果**：下载生成的 .docx 文件

---

*提示：您可以直接在编辑器中输入 Markdown 内容，无需上传文件。*
`;

        document.getElementById('mdEditor').value = sample;
        this.updateCharCount();
    }

    showLoading(text) {
        document.getElementById('loadingText').textContent = text || '处理中...';
        document.getElementById('loading').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }

    async uploadFile(file) {
        this.showLoading('上传文件中...');
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/md-upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            this.hideLoading();
            
            if (data.error) {
                alert(data.error);
                return;
            }

            this.currentFileId = data.file_id;
            
            document.getElementById('fileName').textContent = data.filename;
            document.getElementById('fileSize').textContent = data.file_size;
            document.getElementById('mdEditor').value = data.preview;
            
            this.updateCharCount();
            
            document.getElementById('fileInfo').style.display = 'block';
            document.getElementById('uploadSection').style.display = 'none';
            document.getElementById('editorSection').style.display = 'block';
        } catch (error) {
            this.hideLoading();
            alert('上传失败: ' + error.message);
        }
    }

    async convertToDocx() {
        const content = document.getElementById('mdEditor').value;
        
        if (!content.trim()) {
            alert('请输入或上传 Markdown 内容');
            return;
        }

        this.showLoading('正在转换为 Word 文档...');

        try {
            const data = {
                file_id: this.currentFileId,
                content: content
            };

            const response = await fetch('/md-convert', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            
            this.hideLoading();
            
            if (result.error) {
                alert(result.error);
                return;
            }

            document.getElementById('resultFileName').textContent = result.docx_filename;
            document.getElementById('resultFileSize').textContent = result.docx_size;
            document.getElementById('downloadLink').href = result.download_url;
            
            document.getElementById('editorSection').style.display = 'none';
            document.getElementById('resultSection').style.display = 'block';
        } catch (error) {
            this.hideLoading();
            alert('转换失败: ' + error.message);
        }
    }

    resetAll() {
        this.currentFileId = null;
        document.getElementById('fileInput').value = '';
        document.getElementById('mdEditor').value = '';
        
        this.updateCharCount();
        
        document.getElementById('fileInfo').style.display = 'none';
        document.getElementById('editorSection').style.display = 'none';
        document.getElementById('resultSection').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'block';
    }
};

window.mdApp = new MDToDocxApp();
