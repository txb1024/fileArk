"""
生成 FileArk 应用图标(1024x1024 源 PNG)。

设计:
- 圆角矩形容器(22% 圆角,squircle 近似)
- teal 渐变背景(顶 #2dd4bf → 底 #0d9488),与软件 default accent 一致
- 顶部柔和高光,模拟系统风格的光照
- 中央元素:文件夹 + peeking 文档,体现 "Archive" 概念
- 输出 PNG 后用 `pnpm tauri icon scripts/icon-source.png` 生成全平台 icon
"""

from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

SIZE = 1024
RADIUS = 224  # ~22% — squircle 近似


def make_gradient(top_rgb, bottom_rgb):
    """竖向线性渐变"""
    img = Image.new("RGB", (SIZE, SIZE))
    px = img.load()
    for y in range(SIZE):
        t = y / (SIZE - 1)
        r = round(top_rgb[0] * (1 - t) + bottom_rgb[0] * t)
        g = round(top_rgb[1] * (1 - t) + bottom_rgb[1] * t)
        b = round(top_rgb[2] * (1 - t) + bottom_rgb[2] * t)
        for x in range(SIZE):
            px[x, y] = (r, g, b)
    return img.convert("RGBA")


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([(0, 0), (size, size)], radius=radius, fill=255)
    return m


def top_highlight():
    """顶部柔和的白色高光(径向感)"""
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    h = int(SIZE * 0.55)
    for y in range(h):
        # ease-out:y=0 时 alpha=80,y=h 时 alpha=0
        t = y / h
        alpha = int(85 * (1 - t) ** 1.7)
        d.line([(0, y), (SIZE, y)], fill=(255, 255, 255, alpha))
    return layer


def drop_shadow_layer(target_layer, offset_y=20, blur=22, alpha=110):
    """给一个 RGBA 元素生成模糊投影"""
    sh = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    # 用 target_layer 的 alpha 作为 mask,填充黑色
    base = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    black = Image.new("RGBA", (SIZE, SIZE), (0, 25, 35, 255))
    base.paste(black, (0, offset_y), target_layer.split()[3])
    return base.filter(ImageFilter.GaussianBlur(radius=blur)).point(
        lambda v, a=alpha / 255: int(v * a) if v else 0
    )


def main():
    out = Path(__file__).parent / "icon-source.png"

    # 1) base gradient 容器
    grad = make_gradient((45, 212, 191), (13, 148, 136))  # teal-400 → teal-600
    mask = rounded_mask(SIZE, RADIUS)
    icon = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    icon.paste(grad, (0, 0), mask)

    # 2) 顶部柔和高光(只在圆角内)
    hl = top_highlight()
    hl_clipped = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    hl_clipped.paste(hl, (0, 0), mask)
    icon = Image.alpha_composite(icon, hl_clipped)

    # 3) 中央元素层(单独绘制,后面整体合成)
    elem = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ed = ImageDraw.Draw(elem)
    cx, cy = SIZE // 2, SIZE // 2 + 24

    # --- 后片 folder(白色,带 tab) ---
    # tab(左上凸起)
    tab_left = cx - 280
    tab_right = cx - 60
    tab_top = cy - 232
    tab_bot = cy - 132
    ed.rounded_rectangle(
        [(tab_left, tab_top), (tab_right, tab_bot)],
        radius=28,
        fill=(255, 255, 255, 255),
    )
    # body(后片)
    back_left = cx - 296
    back_right = cx + 296
    back_top = cy - 168
    back_bot = cy + 232
    ed.rounded_rectangle(
        [(back_left, back_top), (back_right, back_bot)],
        radius=44,
        fill=(255, 255, 255, 255),
    )

    # --- 中间露出的文档(白色,从前片顶部凸出) ---
    # 前片顶部在 cy - 60,这里让 doc 顶部到 cy - 156,凸出约 96 px,内容线在凸出区域
    doc_left = cx - 200
    doc_right = cx + 200
    doc_top = cy - 156
    doc_bot = cy + 40
    # 阴影(浅 teal 投影,与背景融合)
    sh = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [(doc_left + 6, doc_top + 14), (doc_right + 6, doc_bot + 14)],
        radius=18,
        fill=(8, 80, 75, 180),
    )
    sh = sh.filter(ImageFilter.GaussianBlur(radius=10))
    elem = Image.alpha_composite(elem, sh)
    ed = ImageDraw.Draw(elem)
    ed.rounded_rectangle(
        [(doc_left, doc_top), (doc_right, doc_bot)],
        radius=18,
        fill=(255, 255, 255, 255),
    )
    # 文档内容线(teal accent):画在 doc 顶部 80 px 区域,这部分会露在前片之上
    line_widths = [320, 260]
    line_y = doc_top + 30
    for i, lw in enumerate(line_widths):
        x_off = 0 if i == 0 else 10
        ed.rounded_rectangle(
            [(cx - lw // 2 + x_off, line_y),
             (cx - lw // 2 + lw + x_off, line_y + 16)],
            radius=8,
            fill=(13, 148, 136, 245),  # teal-600
        )
        line_y += 36

    # --- 前片 folder(浅 teal,半透明,提供层次) ---
    front_left = cx - 270
    front_right = cx + 270
    front_top = cy - 60
    front_bot = cy + 232
    ed.rounded_rectangle(
        [(front_left, front_top), (front_right, front_bot)],
        radius=40,
        fill=(204, 251, 241, 240),  # teal-100,半透明
    )
    # 前片底部细条加深(底色)
    ed.rounded_rectangle(
        [(front_left, front_bot - 22), (front_right, front_bot)],
        radius=12,
        fill=(94, 234, 212, 255),  # teal-300
    )

    # 给整个 elem 加一个柔和投影(浮起效果)
    shadow_for_folder = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sf_draw = ImageDraw.Draw(shadow_for_folder)
    sf_draw.rounded_rectangle(
        [(back_left, back_top + 22), (back_right, back_bot + 22)],
        radius=44,
        fill=(0, 40, 50, 110),
    )
    sf_draw.rounded_rectangle(
        [(tab_left, tab_top + 22), (tab_right, tab_bot + 22)],
        radius=28,
        fill=(0, 40, 50, 110),
    )
    shadow_for_folder = shadow_for_folder.filter(ImageFilter.GaussianBlur(radius=22))

    # mask 投影到圆角内
    shadow_clipped = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shadow_clipped.paste(shadow_for_folder, (0, 0), mask)
    icon = Image.alpha_composite(icon, shadow_clipped)
    icon = Image.alpha_composite(icon, elem)

    # 4) 最后用 mask 再裁一次确保圆角干净
    final = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    final.paste(icon, (0, 0), mask)
    final.save(out, "PNG", optimize=True)
    print(f"Wrote {out}  ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
