#!/usr/bin/env python3
from PIL import Image
import os

# 打开原始图片
img = Image.open('screenshot-ai-extension/icons/original.jpeg')

# 转换为RGBA模式（支持透明度）
img = img.convert('RGBA')

# 生成不同尺寸的图标
sizes = [16, 48, 128]

for size in sizes:
    # 调整大小，使用高质量的重采样
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    
    # 保存为PNG
    output_path = f'screenshot-ai-extension/icons/icon{size}.png'
    resized.save(output_path, 'PNG')
    print(f'已生成: {output_path}')

print('所有图标生成完成！')
