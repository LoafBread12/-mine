"""يبني «ملفًا واحدًا» فيه اللعبة كلها: index.html مع ألعاب الكواكب مضمّنة داخله.
الاستعمال:  python3 build-single.py   ← ينتج mohimmat-alkawakib.html
"""
import base64, pathlib, re, sys
root = pathlib.Path(__file__).resolve().parent
page = (root / "index.html").read_text(encoding="utf-8")
games = sorted(set(re.findall(r'game:\s*"([^"]+\.html)"', page)))
emb = {g: base64.b64encode((root / g).read_bytes()).decode() for g in games}
js = "window.EMBEDDED_GAMES={" + ",".join(f'"{g}":"{b}"' for g, b in emb.items()) + "};"
marker = "<script>\n/* ===================== الإعدادات"
if marker not in page: sys.exit("لم أجد بداية الشيفرة في index.html")
page = page.replace(marker, "<script>" + js + "</script>\n" + marker, 1)
out = root / "mohimmat-alkawakib.html"
out.write_text(page, encoding="utf-8")
print(f"{out.name}: {out.stat().st_size // 1024} KB، الألعاب المضمّنة: {', '.join(games)}")
