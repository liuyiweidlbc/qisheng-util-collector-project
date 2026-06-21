#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DoH (DNS over HTTPS) 验证脚本
使用 Python requests 直接请求 DoH 接口，验证 DNS over HTTPS 是否可用。
不依赖系统 DNS 配置，直接通过 HTTPS 向 DoH 服务商发起 DNS 查询。
"""

import sys
import argparse

try:
    import requests
    import urllib3
except ImportError:
    print("请先安装 requests: pip install requests")
    sys.exit(1)

# 可选：用于仅支持 POST 的 DoH 服务器（如 dnsproxy）
try:
    import dns.message
    import dns.rdatatype
    _HAS_DNS = True
except ImportError:
    _HAS_DNS = False

# 常用 DoH 服务器（GET + application/dns-json）
DOH_SERVERS = [
    {"name": "Cloudflare", "url": "https://cloudflare-dns.com/dns-query"},
    {"name": "Google", "url": "https://dns.google/dns-query"},
    {"name": "Quad9", "url": "https://dns.quad9.net/dns-query"},
    {"name": "阿里DNS", "url": "https://dns.alidns.com/dns-query"},
]

DEFAULT_DOMAIN = "0062zyayk-api-wap-dcdn.jsjqes602.com"
DEFAULT_TIMEOUT = 10


def _disable_ssl_warning():
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def doh_lookup_post(domain: str, qtype: str, server_url: str, timeout: int, verify_ssl: bool) -> dict | None:
    """RFC 8484 POST (application/dns-message)，供仅支持 POST 的 DoH 使用。需 dnspython。"""
    if not _HAS_DNS:
        return None
    q = dns.message.make_query(domain, qtype, want_dnssec=False)
    wire = q.to_wire()
    headers = {"Content-Type": "application/dns-message", "Accept": "application/dns-message"}
    r = requests.post(server_url, data=wire, headers=headers, timeout=timeout, verify=verify_ssl)
    r.raise_for_status()
    msg = dns.message.from_wire(r.content)
    # 转成与 GET 相同的 dict 结构
    answers = []
    for rrset in msg.answer:
        rtype = rrset.rdtype
        for rdata in rrset:
            answers.append({
                "type": rtype,
                "name": str(rrset.name),
                "data": rdata.to_text() if hasattr(rdata, "to_text") else str(rdata),
                "TTL": rrset.ttl,
            })
    return {"Status": 0 if msg.rcode() == dns.rcode.NOERROR else 3, "Answer": answers}


def doh_lookup(domain: str, qtype: str = "A", server_url: str = None, timeout: int = DEFAULT_TIMEOUT, verify_ssl: bool = True) -> dict:
    """
    通过 DoH 查询 DNS：先试 GET (application/dns-json)，若返回 400 则试 POST (application/dns-message)。
    :param domain: 要查询的域名
    :param qtype: 记录类型，如 A, AAAA, CNAME
    :param server_url: DoH 接口 URL，默认使用 Cloudflare
    :param timeout: 请求超时秒数
    :param verify_ssl: 是否校验 HTTPS 证书（自签名证书时可设为 False）
    :return: 含 Status, Answer 等的 dict
    """
    if not verify_ssl:
        _disable_ssl_warning()
    url = server_url or DOH_SERVERS[0]["url"]
    params = {"name": domain, "type": qtype}
    headers = {"Accept": "application/dns-json"}
    r = requests.get(url, params=params, headers=headers, timeout=timeout, verify=verify_ssl)
    if r.status_code == 400:
        if _HAS_DNS:
            # dnsproxy 等仅支持 RFC 8484 POST
            return doh_lookup_post(domain, qtype, url, timeout, verify_ssl)
        raise requests.HTTPError(
            "400: 该 DoH 可能仅支持 POST。请安装 dnspython 后重试: pip install dnspython",
            response=r,
        )
    r.raise_for_status()
    return r.json()


def run_verify(domain: str = DEFAULT_DOMAIN, timeout: int = DEFAULT_TIMEOUT, verbose: bool = True):
    """对多个 DoH 服务器进行查询验证，并打印结果。"""
    print("=" * 50)
    print("DoH (DNS over HTTPS) 验证")
    print("=" * 50)
    print(f"测试域名: {domain}")
    print(f"超时: {timeout}s")
    print()

    all_ok = True
    for srv in DOH_SERVERS:
        name, url = srv["name"], srv["url"]
        try:
            data = doh_lookup(domain, "A", server_url=url, timeout=timeout)
            status = data.get("Status", -1)
            answers = data.get("Answer") or []

            if status == 0 and answers:
                ips = [a.get("data") for a in answers if a.get("type") == 1]
                print(f"  [{name}] OK - {', '.join(ips)}")
                if verbose and answers:
                    for a in answers:
                        print(f"           type={a.get('type')} name={a.get('name')} data={a.get('data')} TTL={a.get('TTL')}")
            else:
                print(f"  [{name}] 无结果 (Status={status})")
                all_ok = False
        except requests.RequestException as e:
            print(f"  [{name}] 失败 - {e}")
            all_ok = False
        print()

    print("=" * 50)
    if all_ok:
        print("全部 DoH 服务器验证通过。")
    else:
        print("部分 DoH 服务器不可用（可能受网络或防火墙影响）。")
    return 0 if all_ok else 1


def main():
    parser = argparse.ArgumentParser(description="验证 DoH (DNS over HTTPS) 是否可用")
    parser.add_argument("domain", nargs="?", default=DEFAULT_DOMAIN, help=f"要解析的域名，默认 {DEFAULT_DOMAIN}")
    parser.add_argument("-t", "--timeout", type=int, default=DEFAULT_TIMEOUT, help="请求超时秒数")
    parser.add_argument("-q", "--quiet", action="store_true", help="仅输出成功/失败，不打印每条记录详情")
    parser.add_argument("-u", "--url", type=str, default=None, help="仅测试指定的 DoH 地址，如 https://doh.yourdomain.com/dns-query 或 https://IP/dns-query")
    parser.add_argument("-k", "--insecure", action="store_true", help="不校验 HTTPS 证书（用于自签名/纯 IP 自建 DoH）")
    args = parser.parse_args()

    if args.url:
        # 仅验证单个自建 DoH 地址
        print("=" * 50)
        print("DoH 自建服务验证")
        print("=" * 50)
        print(f"测试域名: {args.domain}")
        print(f"DoH 地址: {args.url}")
        if args.insecure:
            print("(不校验 SSL 证书)")
        print()
        try:
            data = doh_lookup(args.domain, "A", server_url=args.url, timeout=args.timeout, verify_ssl=not args.insecure)
            status = data.get("Status", -1)
            answers = data.get("Answer") or []
            if status == 0 and answers:
                ips = [a.get("data") for a in answers if a.get("type") == 1]
                print(f"  OK - {', '.join(ips)}")
                if not args.quiet and answers:
                    for a in answers:
                        print(f"  type={a.get('type')} name={a.get('name')} data={a.get('data')} TTL={a.get('TTL')}")
                return 0
            else:
                print(f"  无结果 (Status={status})")
                return 1
        except Exception as e:
            print(f"  失败 - {e}")
            return 1

    return run_verify(domain=args.domain, timeout=args.timeout, verbose=not args.quiet)


if __name__ == "__main__":
    sys.exit(main())
