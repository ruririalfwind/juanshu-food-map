# -*- coding: utf-8 -*-
"""店铺聚合 v2：一条微博可引用多家店 → 各店都计数；坐标用店级坐标优先"""
import json, os

BASE = os.path.dirname(os.path.abspath(__file__))

def run(data):
    """聚合：spots → shops（可被 update_gh 复用）"""
    spots = data.get('spots', [])
    by_name = {}
    for s in spots:
        sl = s.get('shops') or ([{'name': s.get('shopName')}] if s.get('shopName') else [])
        for sh in sl:
            name = sh.get('name') or s.get('shopName')
            if not name:
                continue
            key = name
            if key not in by_name:
                by_name[key] = {
                    'name': name,
                    'city': sh.get('city', ''),
                    'address': sh.get('address', ''),
                    'lat': sh.get('lat') if sh.get('lat') is not None else s.get('lat'),
                    'lng': sh.get('lng') if sh.get('lng') is not None else s.get('lng'),
                    'verified': bool(sh.get('verified')),
                    'note': sh.get('note', ''),
                    'source': s.get('shopSource', ''),
                    'refs': [],
                }
            by_name[key]['refs'].append({
                'id': s['id'], 'date': s['date'], 'time': s.get('time', ''),
                'text': s['text'], 'images': s.get('images', []),
                'url': s['url'], 'type': s['type'], 'region': s.get('region', ''),
            })
    for k in by_name:
        by_name[k]['repurchaseCount'] = len(by_name[k]['refs'])
        by_name[k]['lastVisit'] = max((r['date'] for r in by_name[k]['refs']), default='')
        by_name[k]['refs'].sort(key=lambda r: r['date'], reverse=True)
    data['shops'] = sorted(by_name.values(), key=lambda x: (-x['repurchaseCount'], x['city'], x['name']))
    data['meta']['shopCount'] = len(data['shops'])
    data['meta']['repurchaseNote'] = '复购次数=博主发布该店相关微博条数（多次打卡）'
    return data

if __name__ == '__main__':
    with open(os.path.join(BASE, 'foods.json'), 'r', encoding='utf-8') as f:
        data = json.load(f)
    # 合并手动录入
    try:
        notes = json.load(open(os.path.join(BASE, 'shop_notes.json'), encoding='utf-8'))
    except Exception:
        notes = {}
    if notes:
        for s in data.get('spots', []):
            if s['id'] in notes:
                n = notes[s['id']]
                s['shopName'] = n['name']
                s['shopSource'] = '手动录入'
                s['shops'] = [{'name': n['name'], 'city': '广州', 'address': n.get('address', ''),
                               'verified': False, 'note': '手动录入'}]
                if n.get('address'):
                    s['place'] = '广州 · ' + n['address']
                if s.get('lat') is None or s.get('lng') is None:
                    s['lat'], s['lng'] = 22.8000, 113.5300
    run(data)
    with open(os.path.join(BASE, 'foods.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f'聚合完成：{len(data["shops"])} 家店铺')
multi = [sh for sh in shops if sh['repurchaseCount'] > 1]
print(f'复购≥2 的店铺：{len(multi)} 家')
for sh in sorted(multi, key=lambda x: -x['repurchaseCount']):
    print(f"- {sh['name']} [{sh['city']}] 复购x{sh['repurchaseCount']}")
