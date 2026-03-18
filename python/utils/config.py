"""설정 유틸리티"""

import os
import json
import sys


def get_appdata_dir() -> str:
    """AUZA 앱 데이터 디렉토리 경로"""
    appdata = os.environ.get('APPDATA', '')
    return os.path.join(appdata, 'AUZA')


def load_config() -> dict:
    """설정 파일 로딩"""
    config_path = os.path.join(get_appdata_dir(), 'config.json')
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def log(message: str):
    """stderr 로깅 (stdout은 IPC JSON용)"""
    sys.stderr.write(f"[auza-python] {message}\n")
    sys.stderr.flush()
