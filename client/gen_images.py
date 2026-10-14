#!/usr/bin/env python3
import os
OUT = os.path.join(os.path.dirname(__file__), 'public', 'images')
os.makedirs(OUT, exist_ok=True)
AMBER, LINE = "#e08a2b", "#cdd8d5"

def frame(bg1, bg2, inner):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/></linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe7e6"/></linearGradient>
    <radialGradient id="sun" cx="0.8" cy="0.15" r="0.9"><stop offset="0" stop-color="rgba(255,255,255,0.35)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></radialGradient>
  </defs>
  <rect width="640" height="400" fill="url(#bg)"/><rect width="640" height="400" fill="url(#sun)"/>
  <ellipse cx="320" cy="330" rx="250" ry="26" fill="rgba(0,0,0,0.12)"/>{inner}</svg>'''

def wheels(x1, x2, y=300, r=34):
    def w(cx): return f'<circle cx="{cx}" cy="{y}" r="{r}" fill="#1b1b1b"/><circle cx="{cx}" cy="{y}" r="{r-11}" fill="#c9ccce"/><circle cx="{cx}" cy="{y}" r="7" fill="#6b7073"/>'
    return w(x1) + w(x2)

sedan = f'<path d="M110 300 Q118 232 190 224 L250 190 Q320 170 400 192 L470 226 Q540 236 548 300 Z" fill="url(#body)" stroke="{LINE}" stroke-width="2"/><path d="M258 200 Q320 184 392 202 L438 226 L228 226 Z" fill="#bcd0d4"/><rect x="150" y="262" width="360" height="10" rx="5" fill="{AMBER}"/>{wheels(200,460)}'
suv = f'<path d="M96 300 Q100 214 150 208 L188 168 Q210 150 250 150 L430 150 Q470 150 486 172 L520 210 Q556 216 556 300 Z" fill="url(#body)" stroke="{LINE}" stroke-width="2"/><path d="M198 172 Q214 158 250 158 L318 158 L318 208 L182 208 Z" fill="#bcd0d4"/><path d="M330 158 L420 158 Q452 158 468 178 L486 208 L330 208 Z" fill="#bcd0d4"/><rect x="140" y="260" width="380" height="11" rx="5" fill="{AMBER}"/>{wheels(196,470,y=304,r=38)}'
eco = f'<path d="M140 300 Q146 244 206 236 L252 200 Q320 184 392 202 L440 238 Q506 244 512 300 Z" fill="url(#body)" stroke="{LINE}" stroke-width="2"/><path d="M262 208 Q320 194 388 210 L420 236 L236 236 Z" fill="#bcd0d4"/><rect x="176" y="268" width="308" height="9" rx="4" fill="{AMBER}"/>{wheels(226,440,y=302,r=32)}'
perf = f'<path d="M96 306 Q104 258 176 246 L250 206 Q330 190 424 212 L520 250 Q566 260 560 306 Z" fill="url(#body)" stroke="{LINE}" stroke-width="2"/><path d="M262 216 Q330 202 414 220 L470 248 L232 248 Z" fill="#b0c6ca"/><path d="M120 300 Q300 288 552 300" stroke="{AMBER}" stroke-width="8" fill="none"/>{wheels(196,470,y=308,r=36)}'
lux = f'<path d="M104 300 Q112 236 188 226 L252 188 Q330 166 412 190 L482 228 Q552 238 552 300 Z" fill="url(#body)" stroke="{LINE}" stroke-width="2"/><path d="M260 198 Q330 180 404 200 L446 228 L230 228 Z" fill="#9fb4b8"/><rect x="150" y="260" width="360" height="12" rx="6" fill="{AMBER}"/>{wheels(202,456,y=302,r=35)}'

specs = {
    'economical.svg': ('#e9efee', '#cdd8d5', eco), 'sedan.svg': ('#e4ecec', '#c4d2d2', sedan),
    'suv.svg': ('#dde8e7', '#bccecb', suv), 'performance.svg': ('#122e33', '#0b2024', perf),
    'luxury.svg': ('#14343a', '#0c2529', lux),
}
for f, (b1, b2, inner) in specs.items():
    open(os.path.join(OUT, f), 'w').write(frame(b1, b2, inner)); print('wrote', f)
