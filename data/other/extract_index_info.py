"""
从 index.html 提取 0062 接口信息，并生成 x-checksum（请求头 checksum）

提取内容：
- 页面地址、API 地址
- RESOURCE_URL、FLUID_CDN_URL
- x-checksum（配置中的 SHA256）
- 生成请求头 checksum：Base64(hash|domain|device_id|timestamp|)
"""

import base64
import re
import time
from pathlib import Path
from typing import Optional

# 尝试导入 checksum_utils
try:
    from checksum_utils import encode_checksum, print_encode
except ImportError:
    # 同目录下无 checksum_utils 时使用内联实现
    def encode_checksum(hash_val, domain, device_id, timestamp=None):
        if timestamp is None:
            timestamp = int(time.time() * 1000)
        raw = f"{hash_val}|{domain}|{device_id}|{timestamp}|"
        return base64.b64encode(raw.encode("utf-8")).decode("utf-8")

    def print_encode(hash_val, domain, device_id, timestamp=None):
        if timestamp is None:
            timestamp = int(time.time() * 1000)
        checksum = encode_checksum(hash_val, domain, device_id, timestamp)
        print(f"  hash:      {hash_val}")
        print(f"  domain:    {domain}")
        print(f"  device_id: {device_id}")
        print(f"  timestamp: {timestamp}")
        print(f"编码结果: {checksum}\n")
        return checksum


def extract_from_index(html_path: str) -> dict:
    """
    从 index.html 提取配置信息。

    Returns:
        包含 page_url, resource_url, api_url, x_checksum 等的字典
    """
    path = Path(html_path)
    if not path.exists():
        raise FileNotFoundError(f"文件不存在: {html_path}")

    content = path.read_text(encoding="utf-8", errors="ignore")

    result = {
        "page_url": "",
        "resource_url": "",
        "fluid_cdn_url": "",
        "api_url": "",
        "im_url": "",
        "lottery_api_url": "",
        "x_checksum": "",
        "domain_app": "",
    }

    # 1. 提取 RESOURCE_URL、FLUID_CDN_URL、x-checksum
    resource_match = re.search(r'"RESOURCE_URL"\s*:\s*"([^"]+)"', content)
    if resource_match:
        result["resource_url"] = resource_match.group(1)
        result["page_url"] = result["resource_url"]

    fluid_match = re.search(r'"FLUID_CDN_URL"\s*:\s*"([^"]+)"', content)
    if fluid_match:
        result["fluid_cdn_url"] = fluid_match.group(1)

    checksum_match = re.search(r'"x-checksum"\s*:\s*[\'"]([a-fA-F0-9]{64})[\'"]', content)
    if checksum_match:
        result["x_checksum"] = checksum_match.group(1).lower()

    # 2. 从 RESOURCE_URL 推导 API 地址
    # 0062zyayk-tiger-fluid.jsjqes602.com -> 0062zyayk-api-wap-dcdn.jsjqes602.com
    if result["resource_url"]:
        base = result["resource_url"]
        # 替换子域名部分
        if "tiger-fluid" in base:
            result["api_url"] = base.replace("tiger-fluid", "api-wap-dcdn")
            result["im_url"] = base.replace("tiger-fluid", "im-dcdn")
            result["lottery_api_url"] = base.replace("tiger-fluid", "lottery-dcdn")

    # 3. 提取 domain/app 标识（从 hostname 重定向等逻辑，如 8868e29.app）
    domain_match = re.search(r"8868e\d+\.app", content)
    if domain_match:
        result["domain_app"] = domain_match.group(0)
    else:
        # 文档示例常用 8868e29.app，若未匹配到则使用默认
        result["domain_app"] = "8868e29.app"

    return result


def generate_request_checksum(
    x_checksum: str,
    domain: str,
    device_id: str = "fde170e3362e417d80419b9c0d192257",
    timestamp: Optional[int] = None,
) -> str:
    """
    生成请求头 x-checksum（Base64 格式）。

    格式：Base64(hash|domain|device_id|timestamp|)
    hash 使用配置中的 x-checksum（SHA256）
    """
    return encode_checksum(
        hash_val=x_checksum,
        domain=domain,
        device_id=device_id,
        timestamp=timestamp,
    )


def print_extracted(info: dict) -> None:
    """格式化打印提取结果。"""
    print("=" * 60)
    print("从 index.html 提取的信息")
    print("=" * 60)
    print(f"  主页面:       {info.get('page_url', '')}")
    print(f"  静态资源:     {info.get('resource_url', '')}")
    print(f"  CDN:          {info.get('fluid_cdn_url', '')}")
    print(f"  API 接口:     {info.get('api_url', '')}")
    print(f"  IM 接口:      {info.get('im_url', '')}")
    print(f"  彩票 API:     {info.get('lottery_api_url', '')}")
    print(f"  x-checksum:   {info.get('x_checksum', '')}")
    print(f"  domain/app:  {info.get('domain_app', '')}")
    print("-" * 60)


def main():
    import sys

    # 默认 index.html 路径（与脚本同目录），支持命令行传入
    script_dir = Path(__file__).parent
    index_path = Path(sys.argv[1]) if len(sys.argv) > 1 else script_dir / "index.html"

    if not index_path.exists():
        print(f"错误: 未找到 {index_path}")
        return

    # 提取
    info = extract_from_index(str(index_path))
    print_extracted(info)

    # 生成请求头 x-checksum
    x_checksum = info.get("x_checksum", "")
    domain = info.get("domain_app") or "8868e29.app"

    if not x_checksum:
        print("警告: 未提取到 x-checksum，无法生成请求头 checksum")
        return

    print("生成请求头 x-checksum (Base64):")
    print("-" * 60)
    request_checksum = print_encode(
        hash_val=x_checksum,
        domain=domain,
        device_id="fde170e3362e417d80419b9c0d192257",
    )

    print("=" * 60)
    print("请求时可将上述 Base64 字符串放入请求头，如:")
    print("  x-checksum: <上述编码结果>")
    print("=" * 60)

    return info


if __name__ == "__main__":
    main()
