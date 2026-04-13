# 🍸 AI酒吧数据分析平台

本地AI驱动的酒吧营业数据分析工具。

## 功能
- 📊 上传任意格式Excel，AI自动识别列结构
- 📈 数据可视化（折线图、柱状图、周对比图）
- 🤖 AI智能分析经营建议（DeepSeek驱动）

## 快速开始

### 方式一：本地Python服务器
```bash
pip install flask requests
python3 server.py
# 打开 http://localhost:5188
```

### 方式二：GitHub Pages（仅前端）
访问已部署的前端页面

## 技术栈
- 前端: HTML/CSS/JS + Chart.js + SheetJS
- AI后端: Python Flask + SiliconFlow API
- 地图: Leaflet.js
