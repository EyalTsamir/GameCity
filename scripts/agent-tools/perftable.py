#!/usr/bin/env python3
"""Before/after tables for the perf report, straight from the measurement files.

  python3 -I scripts/agent-tools/perftable.py --perf-before A.txt --perf-after B.txt \
      --hitch-before H0.json --hitch-after H1.json [--soak-before S0.json --soak-after S1.json]

perf*.txt = perf.mjs output (the JSON line), hitch*.json = hitch.mjs --out, soak*.json = soak.mjs stdout.
Prints markdown: per view x hour mean ms/frame (uncapped) and per steady window (vsync) mean / p99 / jank / freezes.
"""
import argparse, json, sys

sys.stdout.reconfigure(encoding='utf-8')


def perf_rows(p):
    for line in open(p, encoding='utf8'):
        if line.startswith('{"base'):
            return {r.get('at', r['variant']): r for r in json.loads(line)['rows']}
    return {}


def hitch_windows(p):
    d = json.load(open(p, encoding='utf8'))
    return {w['name']: w for w in d['windows']}, d


ap = argparse.ArgumentParser()
ap.add_argument('--perf-before'); ap.add_argument('--perf-after')
ap.add_argument('--hitch-before'); ap.add_argument('--hitch-after')
ap.add_argument('--soak-before'); ap.add_argument('--soak-after')
a = ap.parse_args()

if a.perf_before and a.perf_after:
    B, A = perf_rows(a.perf_before), perf_rows(a.perf_after)
    print('| מבט | לפני (ms) | אחרי (ms) | שינוי | fps לפני → אחרי |')
    print('|---|---|---|---|---|')
    for k, b in B.items():
        if k not in A: continue
        x = A[k]
        print(f"| {k} | {b['msPerFrame']} | {x['msPerFrame']} | {x['msPerFrame'] - b['msPerFrame']:+.1f} | {b['fps']} → {x['fps']} |")
    print()

if a.hitch_before and a.hitch_after:
    (HB, db), (HA, da) = hitch_windows(a.hitch_before), hitch_windows(a.hitch_after)
    print('| חלון (vsync) | ממוצע לפני → אחרי | p99 | פריימים חריגים (>2× חציון) | תקיעות (>100ms) | הידור shaders |')
    print('|---|---|---|---|---|---|')
    for k, b in HB.items():
        if k not in HA: continue
        x = HA[k]
        print(f"| {k} | {b['meanMs']} → {x['meanMs']} | {b['p99']} → {x['p99']} | {b.get('outliers', '?')} → {x.get('outliers', '?')} | {b['freeze100']} → {x['freeze100']} | {b['newPrograms']} → {x['newPrograms']} |")
    print(f"\nטעינה עד פריים ראשון: {db['bootMs'] / 1000:.0f} → {da['bootMs'] / 1000:.0f} שניות\n")

if a.soak_before and a.soak_after:
    sb, sa = json.load(open(a.soak_before, encoding='utf8')), json.load(open(a.soak_after, encoding='utf8'))
    tb, ta = sb['total'], sa['total']
    print('| soak (יום משחק, 4 דק\' ×4) | לפני | אחרי |')
    print('|---|---|---|')
    for k, lab in [('frames', 'פריימים'), ('outliers', 'חריגים >2× חציון'), ('jank25', '>25ms'), ('hitch50', '>50ms'), ('freeze100', 'תקיעות >100ms'), ('gcDrops', 'איסופי זבל'), ('longTasks', 'משימות ארוכות'), ('newPrograms', 'הידור shaders'), ('max', 'הפריים הגרוע (ms)')]:
        print(f"| {lab} | {tb.get(k, '?')} | {ta.get(k, '?')} |")
    al = lambda s: (min(x['frame']['allocMBs'] for x in s['samples']), max(x['frame']['allocMBs'] for x in s['samples']))
    print(f"| הקצאות JS (MB/s) | {al(sb)[0]}–{al(sb)[1]} | {al(sa)[0]}–{al(sa)[1]} |")
