var JsonToolApp = class JsonToolApp {
    constructor() {
        this.formattedJson = '';
        this.compactJson = '';
        this.init();
    }

    init() {
        this.input = document.getElementById('jsonInput');
        this.output = document.getElementById('jsonOutput');
        this.message = document.getElementById('jsonMessage');
        this.typeBadge = document.getElementById('jsonTypeBadge');
        this.parseBtn = document.getElementById('parseJsonBtn');
        this.clearBtn = document.getElementById('clearJsonBtn');
        this.copyBtn = document.getElementById('copyJsonBtn');
        this.copyCompactBtn = document.getElementById('copyCompactJsonBtn');
        this.sampleBtn = document.getElementById('loadJsonSampleBtn');
        this.sortKeys = document.getElementById('sortKeys');
        this.ensureAscii = document.getElementById('ensureAscii');
        this.indent = document.getElementById('jsonIndent');

        this.parseBtn.addEventListener('click', () => this.parseJson());
        this.clearBtn.addEventListener('click', () => this.clearAll());
        this.copyBtn.addEventListener('click', () => this.copyText(this.formattedJson, '已复制格式化 JSON'));
        this.copyCompactBtn.addEventListener('click', () => this.copyText(this.compactJson, '已复制压缩 JSON'));
        this.sampleBtn.addEventListener('click', () => this.loadSample());

        [this.sortKeys, this.ensureAscii, this.indent].forEach((control) => {
            control.addEventListener('change', () => {
                if (this.input.value.trim()) {
                    this.parseJson();
                }
            });
        });

        this.input.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                this.parseJson();
            }
        });
    }

    async parseJson() {
        const text = this.input.value.trim();

        if (!text) {
            this.showError('请输入需要转换的 JSON 字符串');
            return;
        }

        this.setLoading(true);

        try {
            const response = await fetch('/json-serialize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text,
                    sort_keys: this.sortKeys.checked,
                    ensure_ascii: this.ensureAscii.checked,
                    indent: this.indent.value
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                this.showError(data.error || 'JSON转换失败');
                return;
            }

            this.formattedJson = data.json;
            this.compactJson = data.compact_json;
            this.output.textContent = data.json;
            this.typeBadge.textContent = data.type;
            this.message.textContent = '转换成功';
            this.message.className = 'json-message success';
            this.copyBtn.disabled = false;
            this.copyCompactBtn.disabled = false;
        } catch (error) {
            this.showError('请求失败：' + error.message);
        } finally {
            this.setLoading(false);
        }
    }

    showError(message) {
        this.formattedJson = '';
        this.compactJson = '';
        this.output.textContent = '无法生成 JSON 输出';
        this.typeBadge.textContent = '错误';
        this.message.textContent = message;
        this.message.className = 'json-message error';
        this.copyBtn.disabled = true;
        this.copyCompactBtn.disabled = true;
    }

    setLoading(isLoading) {
        this.parseBtn.disabled = isLoading;
        this.parseBtn.textContent = isLoading ? '转换中...' : '转换';
    }

    clearAll() {
        this.formattedJson = '';
        this.compactJson = '';
        this.input.value = '';
        this.output.textContent = '等待输入 JSON 字符串';
        this.typeBadge.textContent = '未解析';
        this.message.textContent = '';
        this.message.className = 'json-message';
        this.copyBtn.disabled = true;
        this.copyCompactBtn.disabled = true;
        this.input.focus();
    }

    loadSample() {
        this.input.value = JSON.stringify({
            user: {
                name: '林科全',
                active: true,
                roles: ['admin', 'editor']
            },
            amount: 1280.5,
            items: [
                { name: '高铁票', count: 2 },
                { name: '酒店', count: 1 }
            ],
            remark: null
        });
        this.parseJson();
    }

    async copyText(text, successMessage) {
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
            this.message.textContent = successMessage;
            this.message.className = 'json-message success';
        } catch (error) {
            this.message.textContent = '复制失败，请手动选择结果复制';
            this.message.className = 'json-message error';
        }
    }
};

window.jsonToolApp = new JsonToolApp();
