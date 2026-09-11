# -*- coding: utf-8 -*-
"""
眷属美食地图 · GitHub Actions 增量更新脚本
=========================================
在 GitHub Actions 中运行：
  - 从环境变量 WEIBO_COOKIE 读取微博登录 cookie（仓库 Secret）
  - 请求时间线最新微博，与 foods.json 已有 mid 对比
  - 只处理新增的美食微博：抓详情+评论区（挖店名）→ 更新 foods.json → 下载新图到 media/
  - 已爬过的微博绝不重复请求
"""
import os, sys, json, re, time, html, random, datetime, requests

BASE = os.path.dirname(os.path.abspath(__file__))
FOODS_JSON = os.path.join(BASE, 'foods.json')
MEDIA = os.path.join(BASE, 'media')
os.makedirs(MEDIA, exist_ok=True)

UID = "5038438846"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"

def log(m):
    print(f"[{datetime.datetime.now():%H:%M:%S}] {m}", flush=True)

def make_session():
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Referer": "https://m.weibo.cn/"})
    cookie = os.environ.get("WEIBO_COOKIE", "").strip()
    if cookie:
        s.headers["Cookie"] = cookie
    return s

def safe_get(s, url, retries=3, timeout=15):
    for i in range(retries):
        try:
            r = s.get(url, timeout=timeout)
            if r.status_code == 200:
                try:
                    return r.json()
                except Exception:
                    time.sleep(2)
            elif r.status_code in (302, 432, 414, 461):
                log(f"  [!] 反爬 {r.status_code}，等待")
                time.sleep(20)
            else:
                time.sleep(2)
        except Exception:
            time.sleep(3)
    return None

def strip_html(t):
    if not t:
        return ""
    t = re.sub(r'<img[^>]*alt="([^"]*)"[^>]*>', r"[\1]", t)
    t = re.sub(r'<a[^>]*>([^<]*)</a>', r"\1", t)
    t = re.sub(r"<[^>]+>", "", t)
    return html.unescape(t).strip()

def extract_images(mb):
    urls = []
    for p in (mb.get("pics") or []):
        u = p.get("large", {}).get("url") or p.get("original", {}).get("url") or p.get("url")
        if u:
            urls.append(u.replace("http://", "https://"))
    if not urls and mb.get("original_pic"):
        urls.append(mb["original_pic"]["url"].replace("http://", "https://"))
    return urls

FOOD_KW = ["吃","好吃","吃货","点餐","点菜","菜单","上菜","干饭","约饭","请客","聚餐","店","餐厅","酒楼",
    "饭馆","大排档","茶餐厅","食堂","饭店","小馆","档口","饭","粥","粉","面","煲","濑粉","肠粉","河粉",
    "米粉","云吞","烧腊","烧鹅","叉烧","牛杂","煲仔","啫啫","五柳","姜葱","白切","豉油","糖水","甜品",
    "双皮奶","蛋挞","菠萝包","面包","蛋糕","冰淇淋","芭菲","马卡龙","寿司","刺身","日料","拉面","味增",
    "萨莉亚","麦当劳","汉堡","披萨","沙拉","牛排","西餐","火锅","烧烤","烤肉","酸菜鱼","椰子鸡","猪肚鸡",
    "蛇","水律","黄沙蚬","宵夜","早餐","早茶","下午茶","探店","觅食","馋嘴","美食","打卡","外卖","农庄",
    "牛油果","松茸","海鲜","蟹","虾","三文鱼","小肌鱼","梭子蟹","凉茶","奶茶","咖啡","抹茶"]

def is_food(text):
    return any(k in (text or "") for k in FOOD_KW)

def parse_time(created):
    try:
        dt = datetime.datetime.strptime(created, "%a %b %d %H:%M:%S +0800 %Y")
        return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M:%S")
    except Exception:
        return (created or "")[:10], ""

def dl_img(s, url, path):
    for i in range(3):
        try:
            r = s.get(url, timeout=20)
            if r.status_code == 200 and r.content and len(r.content) > 1000:
                with open(path, 'wb') as f:
                    f.write(r.content)
                return True
            time.sleep(2)
        except Exception:
            time.sleep(3)
    return False

def main():
    with open(FOODS_JSON, 'r', encoding='utf-8') as f:
        data = json.load(f)
    existing = {s['id'] for s in data['spots']}
    log(f"已有 {len(existing)} 条博文")

    s = make_session()
    # 第1页时间线
    d = safe_get(s, f"https://m.weibo.cn/api/container/getIndex?type=uid&value={UID}&containerid=107603{UID}&page=1")
    if not d:
        log("时间线不可达（可能 cookie 失效），本次跳过")
        return
    cards = (d.get("data", {}).get("cards") or [])
    new_mids = []
    newest = [c for c in cards if c.get("card_type") == 9]
    for c in newest:
        mb = c.get("mblog") or {}
        if mb.get("id") not in existing:
            new_mids.append(mb)
    if not new_mids:
        log("没有新微博，无需更新")
        return
    log(f"检测到 {len(new_mids)} 条新微博，继续翻页收集…")

    # 翻页直到遇到已爬 mid
    page = 1
    pending = list(new_mids)
    while page < 50:
        page += 1
        d2 = safe_get(s, f"https://m.weibo.cn/api/container/getIndex?type=uid&value={UID}&containerid=107603{UID}&page={page}")
        if not d2:
            break
        stop = False
        for c in (d2.get("data", {}).get("cards") or []):
            if c.get("card_type") != 9:
                continue
            mb = c.get("mblog") or {}
            if mb.get("id") in existing:
                stop = True
                break
            pending.append(mb)
        if stop:
            break
        time.sleep(random.uniform(0.5, 1))
    log(f"待处理新微博 {len(pending)} 条")

    added = 0
    for mb in pending:
        mid = mb.get("id")
        text = strip_html(mb.get("text", ""))
        if not is_food(text):
            continue
        # 详情
        detail = safe_get(s, f"https://m.weibo.cn/api/statuses/show?id={mid}")
        mbf = (detail or {}).get("data", {}).get("mblog") or mb
        text = strip_html(mbf.get("text", text))
        created = mbf.get("created_at", "")
        date, t = parse_time(created)
        images = extract_images(mbf)
        region = ((mbf.get("region_name") or "")).replace("发布于 ", "") if mbf.get("region_name") else ""
        spot = {
            "id": mid, "date": date, "time": t, "food": text[:120], "type": "未分类",
            "place": "", "region": region, "lat": None, "lng": None, "locNote": "坐标待标注",
            "text": text, "images": images, "url": f"https://m.weibo.cn/detail/{mid}",
            "tags": [], "shopName": "", "shops": [], "shopSource": "无",
            "ownerComments": [], "commentCount": 0,
        }
        # 评论（挖博主本人店名回复）
        cmt = safe_get(s, f"https://m.weibo.cn/api/comments/show?id={mid}")
        if cmt:
            cm = cmt.get("data") or {}
            spot["commentCount"] = cm.get("total_number", 0)
            spot["ownerComments"] = [strip_html(c.get("text", "")) for c in (cm.get("data") or [])
                                     if str((c.get("user") or {}).get("id", "")) == UID][:6]
        # 店名匹配（仓库内置 SHOP_MAP）
        sys.path.insert(0, BASE)
        from shop_map import SHOP_MAP
        if mid in SHOP_MAP:
            shops = []
            for sh in SHOP_MAP[mid]:
                e = {"name": sh["name"], "city": sh["city"], "address": sh.get("address", ""),
                     "verified": sh.get("verified", False), "note": sh.get("note", "")}
                if sh.get("lat") is not None:
                    e["lat"], e["lng"] = sh["lat"], sh["lng"]
                shops.append(e)
            spot["shops"] = shops
            m0 = SHOP_MAP[mid][0]
            spot["shopName"] = m0["name"]
            spot["shopSource"] = "博主本人评论+平台交叉验证" if m0.get("verified") else "博主本人评论（待核）"
            if m0.get("lat") is not None:
                spot["lat"], spot["lng"] = m0["lat"], m0["lng"]
                spot["place"] = f"{m0['city']} · {m0.get('address','')}"
                spot["locNote"] = "店铺坐标已平台验证" if m0.get("verified") else "店铺坐标区域级标注"
            # 下载新图
            new_imgs = []
            for i, u in enumerate(images):
                fname = f"{mid}_{i}.jpg"
                fpath = os.path.join(MEDIA, fname)
                if dl_img(s, u, fpath):
                    new_imgs.append(f"media/{fname}")
                else:
                    new_imgs.append(u)
            spot["images"] = new_imgs
        data['spots'].append(spot)
        added += 1
        time.sleep(random.uniform(0.3, 0.6))

    # 重新聚合 shops
    from build_shops_index import run as rebuild_shops
    rebuild_shops(data)
    data['meta']['updatedAt'] = datetime.date.today().strftime("%Y-%m-%d")
    data['meta']['count'] = len(data['spots'])
    with open(FOODS_JSON, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    log(f"完成：新增 {added} 条美食博文，总计 {len(data['spots'])} 条 / {len(data.get('shops', []))} 家店铺")

if __name__ == "__main__":
    main()
