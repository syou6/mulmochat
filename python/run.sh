#!/bin/bash

# まなびのカタチ - Python FastAPI Server 起動スクリプト

cd "$(dirname "$0")"

# 仮想環境のチェック/作成
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# 仮想環境を有効化
source venv/bin/activate

# 依存関係のインストール
echo "Installing dependencies..."
pip install -q -r requirements.txt

# サーバー起動
echo "Starting FastAPI server on http://localhost:8000"
echo "API docs: http://localhost:8000/docs"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
