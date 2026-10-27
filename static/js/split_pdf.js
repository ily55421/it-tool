var SplitPDFApp = class SplitPDFApp {
    constructor() {
        this.currentFileId = null;
        this.currentTotalPages = 0;
        this.currentFileType = null;
        this.isConverted = false;
        this.init();
    }

    init() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const pagesPerSplit = document.getElementById('pagesPerSplit');
        const convertBtn = document.getElementById('convertBtn');
        const splitBtn = document.getElementById('splitBtn');
        const resetBtn = document.getElementById('resetBtn');

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
                if (['pdf', 'mobi', 'epub'].includes(ext)) {
                    this.uploadFile(files[0]);
                } else {
                    alert('请上传 PDF、MOBI 或 EPUB 文件');
                }
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.uploadFile(e.target.files[0]);
            }
        });

        pagesPerSplit.addEventListener('input', () => this.updatePreview());
        convertBtn.addEventListener('click', () => this.convertToPDF());
        splitBtn.addEventListener('click', () => this.splitPDF());
        resetBtn.addEventListener('click', () => this.resetAll());
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
            const response = await fetch('/split-upload', {
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
            this.currentTotalPages = data.total_pages;
            this.currentFileType = data.file_type;
            this.isConverted = false;

            const typeLabels = {
                'pdf': 'PDF文档',
                'mobi': 'MOBI电子书',
                'epub': 'EPUB电子书'
            };

            document.getElementById('fileName').textContent = data.filename;
            document.getElementById('fileType').textContent = typeLabels[data.file_type] || data.file_type;
            document.getElementById('fileSize').textContent = data.file_size;
            document.getElementById('totalPages').textContent = data.total_pages + ' 页（预估）';

            document.getElementById('fileInfo').style.display = 'block';
            document.getElementById('uploadArea').style.display = 'none';

            if (data.file_type === 'pdf') {
                document.getElementById('splitSection').style.display = 'block';
                document.getElementById('convertSection').style.display = 'none';
                this.updatePreview();
            } else {
                document.getElementById('convertSection').style.display = 'block';
                document.getElementById('splitSection').style.display = 'none';
            }
        } catch (error) {
            this.hideLoading();
            alert('上传失败: ' + error.message);
        }
    }

    async convertToPDF() {
        this.showLoading('正在转换为PDF...');

        try {
            const response = await fetch('/convert-file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    file_id: this.currentFileId,
                    file_type: this.currentFileType
                })
            });
            const data = await response.json();
            
            this.hideLoading();
            
            if (data.error) {
                alert(data.error);
                return;
            }

            this.isConverted = true;
            this.currentTotalPages = data.total_pages;

            document.getElementById('totalPages').textContent = data.total_pages + ' 页';
            document.getElementById('fileSize').textContent = data.pdf_size;

            document.getElementById('convertSection').style.display = 'none';
            document.getElementById('splitSection').style.display = 'block';
            this.updatePreview();

            alert('转换成功！PDF文件已生成，共 ' + data.total_pages + ' 页');
        } catch (error) {
            this.hideLoading();
            alert('转换失败: ' + error.message);
        }
    }

    updatePreview() {
        const pagesPerSplit = parseInt(document.getElementById('pagesPerSplit').value) || 1;
        const totalSplits = Math.ceil(this.currentTotalPages / pagesPerSplit);
        
        const previewInfo = document.getElementById('previewInfo');
        previewInfo.innerHTML = `
            <p>拆分预览: 将生成 <strong>${totalSplits}</strong> 个PDF文件</p>
            <p class="preview-detail">每份包含 ${pagesPerSplit} 页，共 ${this.currentTotalPages} 页</p>
        `;
    }

    async splitPDF() {
        const pagesPerSplit = document.getElementById('pagesPerSplit').value;
        
        if (!pagesPerSplit || pagesPerSplit < 1) {
            alert('请输入有效的拆分页数');
            return;
        }

        if (parseInt(pagesPerSplit) > this.currentTotalPages) {
            alert('拆分页数不能大于总页数');
            return;
        }

        this.showLoading('正在拆分PDF...');

        try {
            const response = await fetch('/split-pdf', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    file_id: this.currentFileId,
                    pages_per_split: pagesPerSplit
                })
            });
            const data = await response.json();
            
            this.hideLoading();
            
            if (data.error) {
                alert(data.error);
                return;
            }

            this.displayResults(data);
        } catch (error) {
            this.hideLoading();
            alert('拆分失败: ' + error.message);
        }
    }

    displayResults(data) {
        document.getElementById('resultInfo').innerHTML = `
            <p>成功拆分 <strong>${data.total_splits}</strong> 个PDF文件</p>
        `;

        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';

        data.split_files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-details">
                    <div class="file-name">${file.filename}</div>
                    <div class="file-meta">
                        <span>${file.pages}</span>
                        <span>${file.file_size}</span>
                    </div>
                </div>
                <a href="${file.download_url}" class="btn btn-download" download>下载</a>
            `;
            fileList.appendChild(fileItem);
        });

        document.getElementById('splitSection').style.display = 'none';
        document.getElementById('resultSection').style.display = 'block';
    }

    resetAll() {
        this.currentFileId = null;
        this.currentTotalPages = 0;
        this.currentFileType = null;
        this.isConverted = false;
        document.getElementById('fileInput').value = '';
        
        document.getElementById('fileInfo').style.display = 'none';
        document.getElementById('convertSection').style.display = 'none';
        document.getElementById('splitSection').style.display = 'none';
        document.getElementById('resultSection').style.display = 'none';
        document.getElementById('uploadArea').style.display = 'flex';
    }
};

window.splitApp = new SplitPDFApp();
