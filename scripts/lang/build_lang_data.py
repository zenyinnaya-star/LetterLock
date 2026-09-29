"""Build Letterlock word data for es, fr, de, ja, zh.

Everything is normalized to plain a-z so the banned-letter mechanic works in every language:
  es/fr/de -> lowercase, accents folded (á->a, ñ->n, ß->ss, œ->oe)
  ja       -> Hepburn romaji (pykakasi)      猫 -> neko
  zh       -> toneless pinyin (pypinyin)      猫 -> mao
Outputs to ../data/<lang>/: words.txt, cats.tsv (prompt text \t word), native.tsv (native \t roman, ja/zh only)
"""
import json, os, re, sys, unicodedata, xml.etree.ElementTree as ET
from collections import defaultdict
from nltk.corpus import wordnet as wn
import pykakasi, pypinyin
sys.path.insert(0, '/tmp/claude-0/lang')

OUT = sys.argv[1]
LANGS = ['es', 'fr', 'de', 'ja', 'zh']
OMW = {'es': 'spa', 'fr': 'fra', 'ja': 'jpn', 'zh': 'cmn'}
kks = pykakasi.kakasi()

def fold(s):
    s = s.lower().replace('ß', 'ss').replace('œ', 'oe').replace('æ', 'ae')
    s = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in s if not unicodedata.combining(c))

def norm(word, lang):
    w = word.strip()
    if not w or any(c in w for c in ' _-\'’.·'):
        return None
    if lang == 'ja':
        r = ''.join(x['hepburn'] for x in kks.convert(w))
    elif lang == 'zh':
        if not all('一' <= c <= '鿿' for c in w):
            return None
        r = ''.join(pypinyin.lazy_pinyin(w, style=pypinyin.Style.NORMAL, v_to_u=False)).replace('v', 'u')
    else:
        r = fold(w)
    r = r.lower()
    if not re.fullmatch(r'[a-z]{3,14}', r):
        return None
    return r

def variants(r, lang):
    out = {r}
    if lang == 'ja':
        v = r.replace('ou', 'o')
        v = re.sub(r'([aiueo])\1', r'\1', v)
        if len(v) >= 3:
            out.add(v)
    return out

# ---- German: OdeNet synsets linked to PWN 3.0 through the ILI ----
ili2pwn = {}
for line in open('/home/claude/globalwordnet/cili/ili-map-pwn30.tab'):
    ili, off = line.split()
    ili2pwn[ili] = off  # e.g. 00001740-a
de_syn_lemmas = defaultdict(set)
de_all = set()
tree = ET.parse('/home/claude/hdasprachtechnologie/odenet/odenet/wordnet/deWordNet.xml')
root = tree.getroot()
syn_ili = {}
for s in root.iter('Synset'):
    if s.get('ili'):
        syn_ili[s.get('id')] = s.get('ili')
for e in root.iter('LexicalEntry'):
    lem = e.find('Lemma').get('writtenForm')
    de_all.add(lem)
    for sense in e.iter('Sense'):
        ili = syn_ili.get(sense.get('synset'))
        if ili and ili in ili2pwn:
            de_syn_lemmas[ili2pwn[ili]].add(lem)

def pwn_key(s):
    pos = s.pos()
    return f"{s.offset():08d}-{'a' if pos == 's' else pos}", f"{s.offset():08d}-{pos}"

def lemmas(s, lang):
    if lang == 'de':
        a, b = pwn_key(s)
        return de_syn_lemmas.get(a, set()) | de_syn_lemmas.get(b, set())
    return set(s.lemma_names(OMW[lang]))

def closure(names):
    out = set()
    for n in names:
        try:
            s = wn.synset(n)
        except Exception:
            continue
        todo = [s]
        while todo:
            x = todo.pop()
            if x in out:
                continue
            out.add(x)
            todo.extend(x.hyponyms())
    return out

def adj_syns(seeds):
    out = set()
    for n in seeds:
        for s in wn.synsets(n, 'a')[:3] + wn.synsets(n, 's')[:2]:
            out.add(s)
            out.update(s.similar_tos())
    return out

P = {p['text']: p for p in json.load(open('/tmp/claude-0/cat/prompts.json'))}
EN = json.load(open('/tmp/claude-0/cat/lists.json'))
ACTIVE = [l.strip() for l in open('/tmp/claude-0/lang/active.txt') if l.strip()]

FOOD = ['A type of food', 'A fruit', 'A vegetable', 'Something you can drink', 'A dessert or sweet treat', 'A herb or spice']
ROOT_OVERRIDE = {
    'Something you find in a kitchen': ['kitchen_utensil.n.01', 'cookware.n.01', 'kitchen_appliance.n.01', 'tableware.n.01',
                                        'cutlery.n.02', 'crockery.n.01', 'pot.n.01', 'pan.n.01', 'spoon.n.01', 'fork.n.01',
                                        'plate.n.04', 'bowl.n.03', 'cup.n.01', 'glass.n.02', 'oven.n.01', 'refrigerator.n.01',
                                        'stove.n.01', 'sink.n.01', 'kettle.n.01', 'jar.n.01', 'bottle.n.01', 'table.n.02'],
    'A container': ['bag.n.01', 'box.n.01', 'bottle.n.01', 'jar.n.01', 'can.n.01', 'basket.n.01', 'bin.n.01', 'bucket.n.01',
                    'case.n.05', 'tank.n.02', 'barrel.n.02', 'crate.n.01', 'envelope.n.01', 'pot.n.01', 'cup.n.01',
                    'bowl.n.03', 'chest.n.02', 'vase.n.01', 'urn.n.01', 'jug.n.01', 'pitcher.n.02', 'flask.n.01',
                    'suitcase.n.01', 'backpack.n.01', 'purse.n.01', 'wallet.n.01', 'sack.n.01', 'drum.n.02', 'vessel.n.03'],
    'A part of the body': ['body_part.n.01', 'external_body_part.n.01', 'organ.n.01', 'bone.n.01', 'muscle.n.01',
                           'joint.n.01', 'gland.n.01', 'digit.n.03', 'blood_vessel.n.01', 'hair.n.01', 'skin.n.01', 'tooth.n.01'],
    'Something that flies': ['bird.n.01', 'aircraft.n.01', 'flying_insect.n.01', 'bat.n.01', 'kite.n.03', 'spacecraft.n.01',
                             'balloon.n.01', 'airship.n.01', 'butterfly.n.01', 'bee.n.01', 'dragonfly.n.01', 'fly.n.01',
                             'mosquito.n.01', 'moth.n.01', 'arrow.n.01', 'rocket.n.01', 'drone.n.03', 'helicopter.n.01'],
}
# prompts whose English list was hand-curated: trust the roots fully instead of the (polluted) generated list
TRUST_ROOTS = set(ROOT_OVERRIDE) | {'A part of the body', 'A type of fish', 'Something you read', 'Something found in space',
                                     'Something electronic', 'A weapon', 'A game', 'A dessert or sweet treat', 'A container',
                                     'A herb or spice', 'A type of fabric', 'A shape', 'An emotion or feeling', 'A piece of furniture'}

def category_synsets(text):
    p = P[text]
    if p.get('adj'):
        return adj_syns(p['adj'])
    roots = ROOT_OVERRIDE.get(text, p.get('roots', []))
    S = closure(roots)
    en = set(EN.get(text, []))
    if text not in TRUST_ROOTS and en:
        # keep only synsets whose English lemma made it into the checked English list
        rootset = set()
        for n in roots:
            try: rootset.add(wn.synset(n))
            except Exception: pass
        S = {s for s in S if s in rootset or any(l.lower() in en for l in s.lemma_names())}
    # plus the English extras (curated words that WordNet doesn't place under the roots)
    for w in p.get('extra', []):
        ss = wn.synsets(w, 'n')
        if ss:
            S.add(ss[0])
    return S

# user-supplied starter lists (from the upload) go into each dictionary too
UPLOAD = {'es': 'Spanish', 'fr': 'French', 'de': 'German', 'ja': 'Japanese', 'zh': 'Chinese'}

stats = {}
for lang in LANGS:
    d = os.path.join(OUT, lang)
    os.makedirs(d, exist_ok=True)
    native = {}
    def add(w):
        r = norm(w, lang)
        if r and lang in ('ja', 'zh') and w != r:
            native.setdefault(w, r)
        return r
    cats = {}
    for text in ACTIVE:
        words = set()
        for s in category_synsets(text):
            for l in lemmas(s, lang):
                r = add(l)
                if r:
                    words |= variants(r, lang)
        cats[text] = words
    from extras import X
    for text, ws in X.get(lang, {}).items():
        for w in ws.split():
            r = add(w)
            if r:
                cats[text] |= variants(r, lang)
    # kitchen also accepts anything edible
    k = 'Something you find in a kitchen'
    for f in FOOD:
        cats[k] |= cats.get(f, set())
    dic = set()
    for ws in cats.values():
        dic |= ws
    if lang == 'de':
        src = de_all
    else:
        src = set(wn.all_lemma_names(lang=OMW[lang]))
    for w in src:
        r = add(w)
        if r:
            dic |= variants(r, lang)
    for w in open(f'/tmp/claude-0/lang/{UPLOAD[lang]}.txt', encoding='utf-8'):
        r = add(w.strip())
        if r:
            dic.add(r)
    with open(os.path.join(d, 'words.txt'), 'w') as f:
        f.write('\n'.join(sorted(dic)) + '\n')
    with open(os.path.join(d, 'cats.tsv'), 'w') as f:
        for text in ACTIVE:
            for w in sorted(cats[text]):
                f.write(f'{text}\t{w}\n')
    if native:
        with open(os.path.join(d, 'native.tsv'), 'w') as f:
            for n, r in sorted(native.items()):
                f.write(f'{n}\t{r}\n')
    stats[lang] = {'dict': len(dic), 'native': len(native),
                   'cats': {t: len(v) for t, v in cats.items()}}
    small = sorted((len(v), t) for t, v in cats.items())[:8]
    print(lang, 'dict', len(dic), 'native', len(native), 'cat words', sum(len(v) for v in cats.values()))
    print('   smallest:', small)
    for t in ['A type of food', 'An animal', 'A color', 'A word meaning happy', 'A part of the body']:
        print('   ', t, sorted(cats[t])[:14])
json.dump(stats, open(os.path.join(OUT, 'stats.json'), 'w'), indent=1)
