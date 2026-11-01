#!/usr/bin/env python3
"""Token cost of a Claude Code session and its subagents, from the local transcripts.

Usage:  python3 scripts/agent-tools/tokens.py [SESSION.jsonl] [--names id=name,...] [--json out.json] [--since ISO]
        (default: the newest session transcript of this project under ~/.claude/projects/)

Prints one terse table per question the next round has to answer:
  1. cost per agent (weighted in input-price units: input 1, cache write 1.25, cache read 0.1, output 5);
  2. cold rewrites: calls that re-wrote > 100k of cache, the idle gap before them, and the command that was
     running during that gap (a wait longer than the cache TTL re-sends the whole context at 12.5x the warm price);
  3. what the context is made of, and what each kind of content cost over its lifetime in the context
     (a token added early is paid again on every later call, at 0.1 warm or 1.25 cold).
Run it after each wave and compare.
"""
import collections, glob, json, os, re, sys, base64, struct
from datetime import datetime

W = {'in': 1.0, 'cw': 1.25, 'cr': 0.1, 'out': 5.0}
COLD = 100_000          # a call that writes more cache than this re-sent (most of) its context
CPT = 2.1               # chars per token of tool text as it reaches the context (least-squares fit on this project)
PER_CALL = 320          # system reminders added per call (same fit)


def ts(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp() if s else None


def img_tokens(block):
    """Approximate image tokens from the encoded size (w*h/750 after the API's downscale)."""
    src = block.get('source') or {}
    data = src.get('data') or ''
    w = h = 0
    try:
        raw = base64.b64decode(data[:200] + '=' * (-len(data[:200]) % 4))
        if raw[:8] == b'\x89PNG\r\n\x1a\n':
            w, h = struct.unpack('>II', raw[16:24])
        elif raw[:4] == b'RIFF' and raw[12:16] == b'VP8X':
            w = 1 + int.from_bytes(raw[24:27], 'little'); h = 1 + int.from_bytes(raw[27:30], 'little')
    except Exception:
        pass
    if not w:
        return 1600
    s = min(1.0, 1568 / max(w, h), (1.15e6 / (w * h)) ** 0.5)
    return int(w * s * h * s / 750)


def classify_tool(name, inp):
    if name == 'Bash':
        c = (inp or {}).get('command', '')
        for pat, lab in ((r'shot\.mjs|capture-set|sheet\.py|qa_sheets|perf\.mjs|soak\.mjs|ui-test', 'Bash:capture/perf'),
                         (r'\bgit\b', 'Bash:git'), (r'\bgrep\b|\brg\b|\bsed -n\b|\bcat\b|\bhead\b|\btail\b', 'Bash:read/grep'),
                         (r'typecheck|tsc|npm run build', 'Bash:typecheck/build')):
            if re.search(pat, c):
                return lab
        return 'Bash:other'
    if name in ('Read',):
        return 'Read'
    if name in ('Edit', 'Write', 'MultiEdit', 'NotebookEdit'):
        return 'Edit/Write'
    if name in ('Grep', 'Glob'):
        return 'Grep/Glob'
    return 'tool:' + (name or '?')


def analyze(path, since=None):
    calls = []                       # (t, usage, ctx_breakdown snapshot cost later)
    cats = collections.Counter()     # tokens per category currently in context (estimated)
    pending = collections.Counter()  # added since the last call
    life = collections.Counter()     # weighted cost attributed per category
    toolmeta = {}                    # tool_use id -> (label, command head, start time)
    last_tool = None                 # (label, cmd head, start, end) of the latest finished tool
    seen = set(); prev_ctx = None; prev_t = None
    colds = []; warm_after_gap = collections.Counter(); cold_after_gap = collections.Counter()
    out_total = 0
    with open(path) as f:
        for line in f:
            try:
                d = json.loads(line)
            except Exception:
                continue
            t = ts(d.get('timestamp'))
            if since and t and t < since:
                continue
            typ = d.get('type'); m = d.get('message') or {}
            if typ == 'attachment':
                continue                                         # bookkeeping; the reminders it renders are PER_CALL
            if typ == 'user':
                cont = m.get('content')
                if isinstance(cont, str):
                    pending['messages in'] += len(cont) / CPT
                    continue
                for c in cont or []:
                    if not isinstance(c, dict):
                        continue
                    if c.get('type') == 'tool_result':
                        lab, cmd, t0 = toolmeta.get(c.get('tool_use_id'), ('tool:?', '', None))
                        last_tool = (lab, cmd, t0, t)
                        cc = c.get('content')
                        if isinstance(cc, str):
                            pending[lab] += len(cc) / CPT
                        for x in cc if isinstance(cc, list) else []:
                            if isinstance(x, dict) and x.get('type') == 'image':
                                pending['images'] += img_tokens(x)
                            elif isinstance(x, dict) and x.get('type') == 'text':
                                pending[lab] += len(x.get('text', '')) / CPT
                    elif c.get('type') == 'image':
                        pending['images'] += img_tokens(c)
                    elif c.get('type') == 'text':
                        pending['messages in'] += len(c.get('text', '')) / CPT
                continue
            if typ != 'assistant':
                continue
            for c in m.get('content') or []:
                if isinstance(c, dict) and c.get('type') == 'tool_use':
                    inp = c.get('input') or {}
                    toolmeta[c.get('id')] = (classify_tool(c.get('name'), inp),
                                             (inp.get('command') or inp.get('file_path') or inp.get('description') or '')[:70], t)
                    pending['own output'] += len(json.dumps(inp)) / CPT
                elif isinstance(c, dict) and c.get('type') == 'text':
                    pending['own output'] += len(c.get('text', '')) / CPT
            mid = m.get('id'); u = m.get('usage')
            if not mid or not u or mid in seen:
                continue
            seen.add(mid)
            i, cw, cr, o = (u.get(k, 0) for k in ('input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'))
            ctx = i + cw + cr; out_total += o
            if ctx == 0:                                         # synthetic message (error / no response)
                continue
            gap = (t - prev_t) / 60 if prev_t and t else 0
            if prev_ctx is None or ctx < prev_ctx - 20_000:      # first call or compaction: context rebuilt
                cats = collections.Counter({'system+brief' if prev_ctx is None else 'compaction summary': ctx})
                pending.clear()
            else:
                delta = ctx - prev_ctx; est = sum(pending.values())
                for k, v in pending.items():
                    cats[k] += v
                cats['reminders (per call)'] += PER_CALL
                cats['thinking kept (residual)'] += delta - est - PER_CALL
                pending.clear()
            if gap > 5:
                (cold_after_gap if cw > COLD else warm_after_gap)['>60' if gap > 60 else '5-60']+= 1
            if cw > COLD and prev_t:
                lab, cmd, t0, t1 = last_tool or ('-', '', None, None)
                running = (t1 - t0) / 60 if t0 and t1 else 0
                colds.append(dict(t=d.get('timestamp'), gap=gap, cw=cw, tool=lab, cmd=cmd, tool_min=running))
            per_tok = (cr * W['cr'] + cw * W['cw'] + i * W['in']) / max(1, ctx)
            tot_est = sum(v for v in cats.values() if v > 0) or 1
            for k, v in cats.items():
                if v > 0:
                    life[k] += ctx * v / tot_est * per_tok
            life['output generation'] += o * W['out']
            calls.append((t, i, cw, cr, o, ctx))
            prev_ctx = ctx; prev_t = t
    tot = dict(zip(('in', 'cw', 'cr', 'out'), (sum(c[k] for c in calls) for k in range(1, 5))))
    ctxs = sorted(c[5] for c in calls)
    q = lambda p: ctxs[int(p * (len(ctxs) - 1))] if ctxs else 0
    return dict(calls=len(calls), tot=tot, weighted=sum(tot[k] * W[k] for k in W), ctx_med=q(.5), ctx_max=q(1),
                colds=colds, warm_after_gap=dict(warm_after_gap), cold_after_gap=dict(cold_after_gap),
                life=dict(life), ctx_now={k: int(v) for k, v in cats.items()})


def main():
    args = sys.argv[1:]
    names = {}; jout = None; since = None; path = None
    while args:
        a = args.pop(0)
        if a == '--names':
            names = dict(kv.split('=') for kv in args.pop(0).split(','))
        elif a == '--json':
            jout = args.pop(0)
        elif a == '--since':
            since = ts(args.pop(0))
        else:
            path = a
    if not path:
        proj = os.path.expanduser('~/.claude/projects/' + re.sub(r'[^A-Za-z0-9]', '-', os.getcwd()))
        path = max(glob.glob(proj + '/*.jsonl'), key=os.path.getmtime)
    files = {'LEAD': path}
    for p in sorted(glob.glob(path[:-6] + '/subagents/agent-*.jsonl')):
        aid = os.path.basename(p)[6:-6]
        meta = p[:-6] + '.meta.json'
        nm = names.get(aid)
        if not nm and os.path.exists(meta):
            try:
                nm = (json.load(open(meta)).get('description') or '')[:18]
            except Exception:
                pass
        files[nm or aid[:10]] = p
    res = {k: analyze(p, since) for k, p in files.items()}
    res = {k: r for k, r in res.items() if r['calls']}
    tw = sum(r['weighted'] for r in res.values()) or 1
    print(f"TOTAL weighted {tw/1e6:.1f}M  (cache read {sum(r['tot']['cr'] for r in res.values())*0.1/tw:.0%},"
          f" cache write {sum(r['tot']['cw'] for r in res.values())*1.25/tw:.0%}, output {sum(r['tot']['out'] for r in res.values())*5/tw:.0%})")
    print(f"\n{'agent':19}{'calls':>6}{'w(M)':>7}{'%':>5}{'ctxMed':>8}{'ctxMax':>8}{'cold':>5}{'coldW%':>7}  idle>5min: warm/cold")
    for k, r in sorted(res.items(), key=lambda kv: -kv[1]['weighted']):
        cw_cold = sum(c['cw'] for c in r['colds']) * 1.25
        wa = sum(r['warm_after_gap'].values()); co = sum(r['cold_after_gap'].values())
        print(f"{k:19}{r['calls']:>6}{r['weighted']/1e6:>7.1f}{100*r['weighted']/tw:>5.1f}{r['ctx_med']//1000:>7}k{r['ctx_max']//1000:>7}k"
              f"{len(r['colds']):>5}{100*cw_cold/max(1,r['weighted']):>6.0f}%  {wa}/{co}")
    colds = [c for r in res.values() for c in r['colds']]
    if colds:
        cw_all = sum(c['cw'] for c in colds) * 1.25
        print(f"\nCOLD rewrites: {len(colds)} calls, {cw_all/1e6:.1f}M weighted = {cw_all/tw:.0%} of all cost")
        by = collections.defaultdict(lambda: [0, 0.0, 0.0])
        for c in colds:
            g = 'tool ran > 5 min' if c['tool_min'] > 5 else ('idle/wait (tool < 5 min)' if c['gap'] > 5 else 'gap < 5 min')
            b = by[(g, c['tool'] if c['tool_min'] > 5 else '')]; b[0] += 1; b[1] += c['cw'] * 1.25; b[2] += c['gap']
        for (g, tl), (n, w, gs) in sorted(by.items(), key=lambda kv: -kv[1][1]):
            print(f"  {g:26}{tl:22}{n:>4} calls {w/1e6:>6.1f}M  mean gap {gs/n:5.1f} min")
        long = collections.Counter()
        for c in colds:
            if c['tool_min'] > 5:
                long[re.sub(r'\s+', ' ', c['cmd'])[:60]] += 1
        print('  longest-running commands before cold calls:')
        for cmd, n in long.most_common(6):
            print(f"    {n:>3}x  {cmd}")
    life = collections.Counter()
    for r in res.values():
        life.update(r['life'])
    lt = sum(life.values()) or 1
    print('\nWHAT THE COST BOUGHT (lifetime cost of each kind of content in context, all agents):')
    for k, v in life.most_common(14):
        print(f"  {k:44}{v/1e6:>7.1f}M {100*v/lt:>5.1f}%")
    if jout:
        json.dump(res, open(jout, 'w'), indent=1, default=str)


if __name__ == '__main__':
    main()
