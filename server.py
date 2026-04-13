#!/usr/bin/env python3
"""
AI Bar Dashboard Backend
本地服务器 - 启动后浏览器访问 http://localhost:5188

功能：
1. /detect_columns  - AI识别Excel列结构
2. /analyze         - AI生成经营分析建议
"""

from flask import Flask, request, jsonify
import requests
import json

app = Flask(__name__)

# ========== CONFIG ==========
AI_KEY = 'sk-toouztjjrgrqsmtlucqsuhmprlerzbfthyyqohprgxvohozh'
AI_URL = 'https://api.siliconflow.cn/v1/chat/completions'
MODEL = 'deepseek-ai/DeepSeek-V3'

# ========== HELPER ==========
def call_sf(prompt):
    """调用 SiliconFlow DeepSeek"""
    headers = {
        'Authorization': f'Bearer {AI_KEY}',
        'Content-Type': 'application/json'
    }
    payload = {
        'model': MODEL,
        'messages': [
            {'role': 'system', 'content': '你是一位专业的酒吧经营数据分析顾问，用中文回复，语言简洁专业，数据驱动。'},
            {'role': 'user', 'content': prompt}
        ],
        'temperature': 0.7,
        'max_tokens': 1500
    }
    resp = requests.post(AI_URL, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data['choices'][0]['message']['content']


def call_sf_structured(prompt):
    """调用 SiliconFlow，返回纯文本"""
    headers = {
        'Authorization': f'Bearer {AI_KEY}',
        'Content-Type': 'application/json'
    }
    payload = {
        'model': MODEL,
        'messages': [
            {'role': 'system', 'content': '你是一个Excel数据解析助手。只返回JSON格式，不要其他文字。'},
            {'role': 'user', 'content': prompt}
        ],
        'temperature': 0.1,
        'max_tokens': 500
    }
    resp = requests.post(AI_URL, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data['choices'][0]['message']['content']


# ========== ROUTES ==========

@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/detect_columns', methods=['POST'])
def detect_columns():
    """接收表头+样本数据，AI识别列结构"""
    body = request.json
    headers = body.get('headers', [])
    sample_rows = body.get('sample_rows', [])

    # 构建发给AI的文本
    sample_text = f"表头: {json.dumps(headers, ensure_ascii=False)}\n\n前10行数据:\n"
    for i, row in enumerate(sample_rows[:10]):
        sample_text += f"行{i+1}: {json.dumps(row, ensure_ascii=False)}\n"

    prompt = f"""你是一个Excel数据解析助手。用户上传了一个酒吧/门店的营业数据Excel文件，但格式不确定。

请分析以下表头和数据，告诉我：
1. 哪一列是【日期】（格式可能是 2024-01-01、2024/1/1、1月1日 等）
2. 哪一列是【时段/班次】（可能有时段如18-21，也可能没有，没有则填null）
3. 哪一列是【营业额/收入/金额】（格式是数字，如3000、8000等）

只返回以下JSON格式，不要其他文字：
{{"日期列": "列名:xxx", "时段列": "列名:xxx"或null, "金额列": "列名:xxx"}}

{sample_text}"""

    try:
        reply = call_sf_structured(prompt)
        # 尝试解析JSON
        import re
        m = re.search(r'\{[\s\S]*\}', reply)
        if m:
            result = json.loads(m.group())
            return jsonify({'success': True, 'mapping': result, 'raw_reply': reply})
        else:
            return jsonify({'success': False, 'error': '无法解析AI响应', 'raw': reply})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/analyze', methods=['POST'])
def analyze():
    """接收统计数据，AI生成分析建议"""
    body = request.json
    stats = body.get('stats', {})
    daily = body.get('daily', {})
    time_ranges = body.get('time_ranges', {})
    weeks = body.get('weeks', {})

    daily_lines = '\n'.join([f"{d}: ¥{v:,.0f}" for d, v in sorted(daily.items())])
    time_lines = '\n'.join([f"{t}: ¥{v:,.0f}" for t, v in sorted(time_ranges.items(), key=lambda x: -x[1])])
    week_lines = '\n'.join([f"{w}: ¥{v:,.0f}" for w, v in sorted(weeks.items())[-6:]])

    prompt = f"""我是某酒吧的运营负责人，请分析以下营业数据，给出专业、可执行的经营建议。

【核心数据】
本周总营业额：¥{stats.get('this_week', 0):,.0f}（环比{stats.get('growth', '0')}%）
上周总营业额：¥{stats.get('last_week', 0):,.0f}
日均营业额：¥{stats.get('daily_avg', 0):,.0f}
高峰时段：{stats.get('peak_time', '-')}（¥{stats.get('peak_revenue', 0):,.0f}）

【每日营业额】
{daily_lines or '暂无'}

【各时段营业额分布】
{time_lines or '暂无'}

【近周营业额对比】
{week_lines or '暂无'}

请从以下维度分析：
1. 📊 本周整体表现评估（结合环比数据）
2. ⏰ 时段分析：哪个时段最有潜力？如何提升？
3. 🚀 下周可立刻执行的2-3个具体行动（具体、可落地）

请用中文回答，语言简洁专业，重点用emoji标注。"""

    try:
        reply = call_sf(prompt)
        return jsonify({'success': True, 'reply': reply})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/health')
def health():
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    print("""
╔══════════════════════════════════════╗
║  🍸 AI酒吧数据分析平台 - 本地服务器  ║
╠══════════════════════════════════════╣
║  浏览器打开: http://localhost:5188  ║
║  Ctrl+C 关闭服务器                  ║
╚══════════════════════════════════════╝
    """)
    app.run(host='0.0.0.0', port=5188, debug=True)
