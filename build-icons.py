#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-icons.py — 把 assets/icon.svg 的设计栅格化成 PWA 安装所需的 PNG 图标。

为什么要做这件事：
  Chrome / Edge 的「安装应用 / 添加到主屏幕」可安装性检测要求 manifest 至少提供
  一张 192x192 与一张 512x512 的**位图**（PNG）图标；仅提供 SVG（sizes="any"）
  会被判为不合格，浏览器因此不会派发 beforeinstallprompt，菜单里也就没有安装项。
  iOS Safari 更严格：apple-touch-icon 完全不支持 SVG，必须是 PNG，否则添加到
  主屏幕后图标是白板或网页截图。

生成物（全部写入 assets/）：
  icon-192.png            192x192  any        —— Chrome 可安装性门槛
  icon-512.png            512x512  any        —— 启动画面 / 商店
  icon-maskable-512.png   512x512  maskable   —— Android 自适应图标（四周留安全边）
  apple-touch-icon.png    180x180             —— iOS 主屏幕图标
  favicon-32.png          32x32               —— 浏览器标签页

用法：python build-icons.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(ROOT, "assets")

# ---- 设计参数（与 assets/icon.svg 保持一致，设计基准 512x512）----
SS = 4                      # 超采样倍数，用于抗锯齿
GRAD_A = (0x25, 0x63, 0xEB)  # #2563eb
GRAD_B = (0x4F, 0x46, 0xE5)  # #4f46e5
CORNER = 112 / 512          # viewBox 512 下的圆角半径
CIRCLE_R = 150 / 512        # 中心半透明圆
CIRCLE_ALPHA = int(0.12 * 255)
EMOJI = "\U0001F3A4"        # 🎤
EMOJI_SIZE = 200 / 512
EMOJI_Y = 300 / 512         # dominant-baseline=middle 的垂直中心
TEXT = "口语"
TEXT_SIZE = 56 / 512
TEXT_Y = 430 / 512          # 默认 alphabetic 基线

FONT_EMOJI = r"C:\Windows\Fonts\seguiemj.ttf"
FONT_CJK = r"C:\Windows\Fonts\msyhbd.ttc"   # 微软雅黑 Bold


def lerp(c1, c2, t):
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c1, c2))


def gradient(size):
    """对角渐变。先在 128x128 上算好再放大——渐变本身平滑，放大无损且快得多。"""
    n = 128
    img = Image.new("RGB", (n, n))
    px = img.load()
    for y in range(n):
        ty = y / (n - 1)
        for x in range(n):
            t = (x / (n - 1) + ty) / 2
            px[x, y] = lerp(GRAD_A, GRAD_B, t)
    return img.resize((size, size), Image.BICUBIC)


def render(size, maskable=False):
    """渲染一枚图标。maskable=True 时背景满幅、内容缩到安全区内。"""
    W = size * SS
    bg = gradient(W)

    if maskable:
        # 自适应图标：背景必须铺满整张画布（不能有圆角/透明），
        # 关键内容收进中心 ~60%，避免被系统裁成圆形/水滴形时切掉。
        out = bg.convert("RGBA")
        s = 0.60
    else:
        out = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        mask = Image.new("L", (W, W), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, W - 1, W - 1], radius=int(CORNER * W), fill=255
        )
        out.paste(bg, (0, 0), mask)
        s = 1.0

    layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = W / 2

    def pos(norm_y):
        """设计坐标(0~1) → 画布像素，按内容缩放系数 s 绕中心缩放。"""
        return c + (norm_y - 0.5) * W * s

    # 中心柔光圆
    r = CIRCLE_R * W * s
    d.ellipse([c - r, c - r, c + r, c + r], fill=(255, 255, 255, CIRCLE_ALPHA))

    # 🎤（彩色 emoji，embedded_color 走字体内嵌位图）
    f_e = ImageFont.truetype(FONT_EMOJI, int(EMOJI_SIZE * W * s))
    d.text((c, pos(EMOJI_Y)), EMOJI, font=f_e, anchor="mm",
           fill=(255, 255, 255, 255), embedded_color=True)

    # 口语（baseline 对齐，所以用 "ms" = 水平居中 + 基线）
    f_t = ImageFont.truetype(FONT_CJK, int(TEXT_SIZE * W * s))
    d.text((c, pos(TEXT_Y)), TEXT, font=f_t, anchor="ms", fill=(255, 255, 255, 255))

    out = Image.alpha_composite(out, layer)
    return out.resize((size, size), Image.LANCZOS)


TARGETS = [
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("icon-maskable-512.png", 512, True),
    ("apple-touch-icon.png", 180, False),
    ("favicon-32.png", 32, False),
]

if __name__ == "__main__":
    os.makedirs(ASSETS, exist_ok=True)
    for name, size, maskable in TARGETS:
        img = render(size, maskable)
        p = os.path.join(ASSETS, name)
        img.save(p, "PNG", optimize=True)
        kb = os.path.getsize(p) / 1024
        print(f"  OK {name:24s} {size}x{size}  {kb:.1f} KB")
    print("图标生成完毕")
