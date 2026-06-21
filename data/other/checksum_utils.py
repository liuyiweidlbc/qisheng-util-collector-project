"""
0062 接口 checksum 编解码工具

请求头 checksum 格式：Base64(hash|domain|device_id|timestamp|)
"""

import base64
import hashlib
import time
from datetime import datetime
from typing import Optional


def decode_checksum(checksum: str) -> dict:
    """
    解码 Base64 checksum 为字典。

    Args:
        checksum: Base64 编码的 checksum 字符串

    Returns:
        包含 hash, domain, device_id, timestamp 的字典
    """
    raw = base64.b64decode(checksum).decode("utf-8")
    parts = raw.strip("|").split("|")
    return {
        "hash": parts[0] if len(parts) > 0 else "",
        "domain": parts[1] if len(parts) > 1 else "",
        "device_id": parts[2] if len(parts) > 2 else "",
        "timestamp": parts[3] if len(parts) > 3 else "",
    }


def encode_checksum(
    hash_val: str,
    domain: str,
    device_id: str,
    timestamp: Optional[int] = None,
) -> str:
    """
    将 hash、domain、device_id、timestamp 编码为 Base64 checksum。

    Args:
        hash_val: 哈希值（如 MD5）
        domain: 应用/域名标识
        device_id: 设备/用户 ID
        timestamp: Unix 毫秒时间戳，默认当前时间

    Returns:
        Base64 编码的 checksum 字符串
    """
    if timestamp is None:
        timestamp = int(time.time() * 1000)
    raw = f"{hash_val}|{domain}|{device_id}|{timestamp}|"
    return base64.b64encode(raw.encode("utf-8")).decode("utf-8")


def print_encode(
    hash_val: str,
    domain: str,
    device_id: str,
    timestamp: Optional[int] = None,
) -> str:
    """
    编码前打印基本信息，再执行编码。

    Args:
        hash_val: 哈希值（如 MD5）
        domain: 应用/域名标识
        device_id: 设备/用户 ID
        timestamp: Unix 毫秒时间戳，默认当前时间

    Returns:
        Base64 编码的 checksum 字符串
    """
    if timestamp is None:
        timestamp = int(time.time() * 1000)

    time_str = ""
    try:
        dt = datetime.fromtimestamp(timestamp / 1000)
        time_str = f" ({dt.strftime('%Y-%m-%d %H:%M:%S')})"
    except (ValueError, OSError):
        pass

    lines = [
        "-" * 50,
        "编码前:",
        f"  hash:      {hash_val}",
        f"  domain:    {domain}",
        f"  device_id: {device_id}",
        f"  timestamp: {timestamp}{time_str}",
    ]
    print("\n".join(lines))

    checksum = encode_checksum(hash_val, domain, device_id, timestamp)
    print(f"编码结果: {checksum}\n")
    return checksum


def generate_hash(data: str, algo: str = "md5") -> str:
    """生成哈希值，默认 MD5。"""
    h = hashlib.new(algo)
    h.update(data.encode("utf-8"))
    return h.hexdigest()


def print_decode(checksum: str, label: str = "") -> dict:
    """
    解码 checksum 并格式化打印。

    Args:
        checksum: Base64 编码的 checksum 字符串
        label: 可选标签，用于区分多个解码结果

    Returns:
        解码后的字典
    """
    result = decode_checksum(checksum)
    ts = result.get("timestamp", "")
    time_str = ""
    if ts and ts.isdigit():
        try:
            dt = datetime.fromtimestamp(int(ts) / 1000)
            time_str = f" ({dt.strftime('%Y-%m-%d %H:%M:%S')})"
        except (ValueError, OSError):
            pass

    lines = [
        "-" * 50,
        f"解码{label}:",
        f"  hash:      {result.get('hash', '')}",
        f"  domain:    {result.get('domain', '')}",
        f"  device_id: {result.get('device_id', '')}",
        f"  timestamp: {result.get('timestamp', '')}{time_str}",
    ]
    print("\n".join(lines))
    return result


if __name__ == "__main__":
    # 解码示例
    c1 = "ZTIzZWM3ZTU5ZTg2ODA5MTI0MjQzOTQ5ZTA5NjdmMThhMzQyNGMxY2EzMjQ2YzI5NWFkY2Y4ZDg4NzMwMzE2ZXw4ODY4ZTI5LmFwcHxmZGUxNzBlMzM2MmU0MTdkODA0MTliOWMwZDE5MjI1N3wxNzcwODA3MzA1OTQ2fA=="
    c2 = "NjMyYzdlMDZiNTI0NDE5MmQ4ZmU0NzAzNTUzMWM0ODE2MjM4ODU0OGQwMzRmMjE5NzZjNjk2YTBiMzQxZTIxYXxsdWV5bmVtanVvcmxoODg2OC5hcHB8ZmRlMTcwZTMzNjJlNDE3ZDgwNDE5YjljMGQxOTIyNTd8MTc2OTc1NTU4NTUyOXw="

    print_decode(c1, " c1")
    print_decode(c2, " c2")

    # 编码示例（编码前打印基本信息）
    print_encode(
        hash_val="918e9d26913230be9bcffc91e5f27e87314d0c95508b0311527863b4d6e96de2",
        domain="8868e33.app",
        device_id="fde170e3362e417d80419b9c0d192257",
    )
