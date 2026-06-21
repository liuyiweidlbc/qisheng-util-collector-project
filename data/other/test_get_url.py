from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
import json
import time

def capture_xhr_requests(url):
    """
    访问指定URL，捕获并打印所有XHR请求的地址和参数（带详细调试日志）
    
    Args:
        url (str): 目标网页地址
    """
    # 配置Chrome选项
    chrome_options = Options()
    # 服务器环境必须的参数
    chrome_options.add_argument('--headless=new')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    
    # 配置日志捕获（包含所有网络请求日志）
    chrome_options.set_capability('goog:loggingPrefs', {'performance': 'ALL'})
    
    # 手动指定 ChromeDriver 路径
    driver_service = Service(executable_path='/usr/bin/chromedriver')
    
    # 初始化浏览器驱动
    driver = webdriver.Chrome(service=driver_service, options=chrome_options)
    
    try:
        print(f"=== 开始访问目标URL: {url} ===")
        # 访问目标网页
        driver.get(url)
        
        # 延长等待时间（确保动态请求完全加载）
        wait_time = 8
        print(f"=== 等待 {wait_time} 秒，让页面和XHR请求加载完成 ===")
        time.sleep(wait_time)
        
        # 获取所有性能日志
        print("=== 开始读取所有性能日志 ===")
        logs = driver.get_log('performance')
        print(f"=== 共读取到 {len(logs)} 条性能日志 ===")
        
        # 存储所有网络请求（用于调试）
        all_network_requests = []
        # 存储筛选后的XHR请求
        xhr_requests = []
        
        # 遍历所有日志，先收集所有网络请求
        for log_idx, log in enumerate(logs):
            try:
                log_message = json.loads(log['message'])['message']
                
                # 只处理网络请求相关的日志
                if log_message['method'] in ['Network.requestWillBeSent', 'Network.responseReceived']:
                    # 提取基础信息
                    request_id = log_message['params'].get('requestId', '未知ID')
                    request_type = log_message['params'].get('type', '未知类型')
                    response_mime = ''
                    request_url = ''
                    
                    # 提取URL和MIME类型
                    if 'response' in log_message['params']:
                        response_mime = log_message['params']['response'].get('mimeType', '未知MIME')
                    if 'request' in log_message['params']:
                        request_url = log_message['params']['request'].get('url', '未知URL')
                    
                    # 记录所有网络请求
                    all_network_requests.append({
                        'log_idx': log_idx,
                        'method': log_message['method'],
                        'request_id': request_id,
                        'type': request_type,
                        'mime_type': response_mime,
                        'url': request_url
                    })
                    
                    # 只处理响应完成的请求（确保能获取完整参数）
                    if log_message['method'] == 'Network.responseReceived':
                        # 放宽XHR过滤规则（包含所有常见的XHR/动态请求类型）
                        is_xhr = False
                        filter_reason = ''
                        
                        # 条件1: type包含xhr/fetch（最核心的XHR标识）
                        if 'xhr' in request_type.lower() or 'fetch' in request_type.lower():
                            is_xhr = True
                        # 条件2: MIME类型为JSON/文本/空（部分XHR返回空MIME）
                        elif response_mime in ['application/json', 'text/plain', 'text/json', 'application/javascript', '']:
                            is_xhr = True
                        # 条件3: URL包含常见的API关键词（兜底规则）
                        elif any(keyword in request_url.lower() for keyword in ['api', 'ajax', 'json', 'data', 'request']):
                            is_xhr = True
                        else:
                            filter_reason = f"类型={request_type}, MIME={response_mime}, URL无API关键词"
                        
                        # 如果是XHR请求，获取详细参数
                        if is_xhr:
                            try:
                                # 获取请求详情
                                request_details = driver.execute_cdp_cmd('Network.getRequestDetails', 
                                                                    {'requestId': request_id})
                                
                                # 提取完整信息
                                request_url = request_details['request']['url']
                                request_method = request_details['request']['method']
                                request_headers = request_details['request']['headers']
                                request_post_data = request_details['request'].get('postData', '无POST参数')
                                request_body_size = request_details['request'].get('headers', {}).get('Content-Length', '0')
                                
                                xhr_requests.append({
                                    'request_id': request_id,
                                    'url': request_url,
                                    'method': request_method,
                                    'type': request_type,
                                    'mime_type': response_mime,
                                    'headers': request_headers,
                                    'post_data': request_post_data,
                                    'body_size': request_body_size
                                })
                                print(f"✅ 匹配XHR请求 - ID:{request_id} | 类型:{request_type} | MIME:{response_mime} | URL:{request_url[:80]}...")
                            except Exception as e:
                                print(f"⚠️ 获取请求详情失败 - ID:{request_id} | 错误:{str(e)}")
                        else:
                            print(f"❌ 非XHR请求 - ID:{request_id} | 原因:{filter_reason} | URL:{request_url[:80]}...")
            except Exception as e:
                print(f"⚠️ 解析第 {log_idx} 条日志失败: {str(e)}")
                continue
        
        # 打印调试信息：所有网络请求汇总
        print("\n" + "="*80)
        print("=== 【调试信息】所有网络请求类型汇总 ===")
        type_stats = {}
        for req in all_network_requests:
            req_type = req['type']
            if req_type not in type_stats:
                type_stats[req_type] = 0
            type_stats[req_type] += 1
        for req_type, count in type_stats.items():
            print(f"  - {req_type}: {count} 次")
        
        # 打印最终的XHR请求详情
        print("\n" + "="*80)
        print(f"=== 最终捕获到 {len(xhr_requests)} 个XHR请求（详细信息） ===")
        if len(xhr_requests) == 0:
            print("⚠️ 未捕获到XHR请求！可能原因：")
            print("  1. 页面等待时间不足，请求未加载完成")
            print("  2. 目标网页无XHR/Fetch动态请求")
            print("  3. 请求被反爬机制拦截（需添加Cookie/UA）")
        else:
            for i, req in enumerate(xhr_requests, 1):
                print(f"\n===== XHR请求 {i} =====")
                print(f"请求ID: {req['request_id']}")
                print(f"请求地址: {req['url']}")
                print(f"请求方法: {req['method']}")
                print(f"请求类型: {req['type']}")
                print(f"MIME类型: {req['mime_type']}")
                print(f"请求头: {json.dumps(req['headers'], indent=2, ensure_ascii=False)}")
                if req['method'] == 'POST' and req['post_data'] != '无POST参数':
                    print(f"POST参数: {req['post_data']}")
                print(f"请求体大小: {req['body_size']} 字节")
        
    except Exception as e:
        print(f"\n❌ 程序核心错误: {str(e)}")
        # 打印错误堆栈（便于排查）
        import traceback
        traceback.print_exc()
    finally:
        print("\n=== 关闭浏览器 ===")
        driver.quit()

# 主程序
if __name__ == "__main__":
    # 替换为你要分析的目标网页地址
    # 测试用例1（有XHR请求）：https://httpbin.org/post
    # 测试用例2（动态加载）：https://www.baidu.com
    target_url = "https://www.baidu.com"  # 请替换为实际网址
    capture_xhr_requests(target_url)
