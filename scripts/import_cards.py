"""Extract original card data and PDF card art. Does not alter source files."""
from pathlib import Path
import json, runpy, sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent
sys.path.insert(0, str(ROOT / '.runtime/python'))

def main():
    deck = runpy.run_path(str(SOURCE / '.workbuddy/cards_v3/deck.py'))
    role_ids = ['regression','confidence','anova','bayes','fool','outlier','svd','normal']
    formula_ids = ['hopital','taylor','lagrange','fourier','cauchy','riemann']
    camps = ['justice'] * 5 + ['evil','neutral','justice']
    roles = {key: dict(name=c['name'], en=c['en'], math=c['math'], description=c['body'], camp=camps[i], image=f'/assets/{key}.png') for i,(key,c) in enumerate(zip(role_ids,deck['IDENTITY']))}
    formulas = {key: dict(name=c['name'], en=c['en'], math=c['math'], description=c['body'], image=f'/assets/{key}.png') for key,c in zip(formula_ids,deck['FORMULA'])}
    (ROOT / 'public/content.json').write_text(json.dumps(dict(roles=roles,formulas=formulas), ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'shared/content.mjs').write_text('export const ROLES = '+json.dumps(roles,ensure_ascii=False)+';\nexport const FORMULAS = '+json.dumps(formulas,ensure_ascii=False)+';\n',encoding='utf-8')
    questions = []
    for i,(stem,answer) in enumerate(deck['TRIVIA']):
        if i == 3:
            answer = '9（π = 3.14159…）'  # Original card mistakenly says 5.
        questions.append(dict(id=f'T{i+1:02}',category='trivia',stem=stem,answer=answer,subject='数学冷知识'))
    for i,(subject,stem,answer) in enumerate(deck['PRO']):
        questions.append(dict(id=f'P{i+1:02}',category='pro',stem=stem,answer=answer,subject=subject))
    (ROOT / 'server/questions.json').write_text(json.dumps(questions,ensure_ascii=False,indent=2),encoding='utf-8')
    import pymupdf
    source = pymupdf.open(SOURCE / '数模侠_A4_正面_v4.0.pdf')
    # Exact source layout from cards_v3/render.py; mm to points.
    render_source = (SOURCE / '.workbuddy/cards_v3/render.py').read_text(encoding='utf-8')
    import re
    print('\n'.join(l for l in render_source.splitlines() if re.match(r'^(MX|MY|PITCH_X|PITCH_Y|CARD_W|CARD_H)\s*=',l)))
    # Source 216 x 303mm sheet: 3x3, 63x88mm cards, 5mm gutters.
    mm = 72 / 25.4
    width,height=63*mm,88*mm
    mx=(216-3*63-2*5)/2*mm; my=(303-3*88-2*5)/2*mm
    physical=[]
    for key,c in zip(role_ids,deck['IDENTITY']): physical.extend([key]*c['copies'])
    physical.extend(key for key in formula_ids for _ in range(3))
    # The role group is padded to two pages before formulas start.
    seen=set()
    for i,key in enumerate(physical):
        if key in seen: continue
        if i<16: page,slot=divmod(i,9)
        else: off=i-16; page,slot=2+off//9,off%9
        row,col=divmod(slot,3)
        rect=pymupdf.Rect(mx+col*68*mm,my+row*93*mm,mx+col*68*mm+width,my+row*93*mm+height)
        source[page].get_pixmap(matrix=pymupdf.Matrix(2,2),clip=rect,alpha=False).save(ROOT / f'public/assets/{key}.png')
        seen.add(key)
    print(f'Imported {len(roles)} roles, {len(formulas)} formulas, {len(questions)} original questions, {len(seen)} original card images')

if __name__=='__main__': main()
