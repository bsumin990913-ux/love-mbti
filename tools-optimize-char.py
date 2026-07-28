"""
char/<검사>/*.png (원본, 1254x1254 · 장당 1MB 안팎) 을 웹에 나가는
char/web/<검사>/<코드>.webp (640x640 · 15KB 안팎) 로 굽는다.

원본은 건드리지 않는다. 새 캐릭터를 추가하거나 다시 그렸을 때만 돌리면 된다:
    python tools-optimize-char.py

파일명은 앞 네 글자를 유형 코드로 읽는다 (enfp-rabbit-v2.png -> enfp.webp).
여백은 배경색 기준 경계 상자로 잘라낸다 — 원본은 캐릭터 주위가 넓어서
그대로 줄이면 결과 화면에서 캐릭터가 너무 작아 보인다.
"""
import glob, os, re, sys
from PIL import Image, ImageChops

SIZE = 640
QUALITY = 82

def bake(src, dst_dir):
    m = re.match(r'([a-z]{4})', os.path.basename(src))
    if not m:
        print('  건너뜀 (코드를 못 읽음):', os.path.basename(src))
        return None
    code = m.group(1)

    im = Image.open(src).convert('RGB')
    bg = im.getpixel((4, 4))
    diff = ImageChops.difference(im, Image.new('RGB', im.size, bg)).convert('L')
    box = diff.point(lambda v: 255 if v > 12 else 0).getbbox()
    if box:
        l, t, r, b = box
        side = max(r - l, b - t)
        side += int(side * 0.05) * 2          # 5% 여백
        side = min(side, im.width, im.height)
        cx, cy = (l + r) // 2, (t + b) // 2
        l = max(0, min(cx - side // 2, im.width - side))
        t = max(0, min(cy - side // 2, im.height - side))
        im = im.crop((l, t, l + side, t + side))

    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    dst = os.path.join(dst_dir, code + '.webp')
    im.save(dst, 'webp', quality=QUALITY, method=6)
    return code, os.path.getsize(src), os.path.getsize(dst)

def main():
    total_in = total_out = 0
    for test_dir in sorted(glob.glob(os.path.join('char', '*', ''))):
        # 윈도에서는 glob 이 char\mbti\ 를 돌려줘서 '/' 만 벗기면 이름이 빈다
        test = os.path.basename(os.path.normpath(test_dir))
        if test == 'web':
            continue
        sources = sorted(glob.glob(os.path.join(test_dir, '*.png')))
        if not sources:
            continue
        dst_dir = os.path.join('char', 'web', test)
        os.makedirs(dst_dir, exist_ok=True)
        print(f'[{test}] {len(sources)}장 -> {dst_dir}')
        for src in sources:
            r = bake(src, dst_dir)
            if r:
                code, a, b = r
                total_in += a; total_out += b
                print(f'  {code}  {a//1024:>5}KB -> {b//1024:>3}KB')
    if total_in:
        print(f'합계 {total_in//1024}KB -> {total_out//1024}KB')
    else:
        print('구울 원본이 없어요. char/<검사>/*.png 를 확인하세요.')

if __name__ == '__main__':
    sys.exit(main())
