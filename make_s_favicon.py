from PIL import Image, ImageDraw, ImageFont
import os

def main():
    # Create a 512x512 image, white background
    size = 512
    img = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)
    
    # Try to load a bold font
    font_paths = [
        "C:\\Windows\\Fonts\\segoeuib.ttf", # Segoe UI Bold
        "C:\\Windows\\Fonts\\arialbd.ttf",   # Arial Bold
        "C:\\Windows\\Fonts\\calibrib.ttf",  # Calibri Bold
    ]
    
    font = None
    for path in font_paths:
        if os.path.exists(path):
            font = ImageFont.truetype(path, 380)
            break
            
    if font is None:
        font = ImageFont.load_default()
        
    # Text to draw (lowercase 's' to match "speaklab")
    text = "s"
    
    # Get text bounding box
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    
    # Center text
    x = (size - text_w) / 2 - bbox[0]
    y = (size - text_h) / 2 - bbox[1] - 30 # slight upward shift looks better
    
    # Draw text in black
    draw.text((x, y), text, font=font, fill=(17, 17, 17, 255))
    
    # Apply rounded corners
    rad = int(size * 0.22)
    circle = Image.new('L', (rad * 2, rad * 2), 0)
    draw_circle = ImageDraw.Draw(circle)
    draw_circle.ellipse((0, 0, rad * 2 - 1, rad * 2 - 1), fill=255)
    
    alpha = Image.new('L', img.size, 255)
    w, h = img.size
    alpha.paste(circle.crop((0, 0, rad, rad)), (0, 0))
    alpha.paste(circle.crop((0, rad, rad, rad * 2)), (0, h - rad))
    alpha.paste(circle.crop((rad, 0, rad * 2, rad)), (w - rad, 0))
    alpha.paste(circle.crop((rad, rad, rad * 2, rad * 2)), (w - rad, h - rad))
    img.putalpha(alpha)
    
    # Save the images
    img.save('e:\\speaklabs\\apple-touch-icon.png')
    
    icon_32 = img.resize((32, 32), Image.Resampling.LANCZOS)
    icon_32.save('e:\\speaklabs\\favicon-32x32.png')
    
    icon_16 = img.resize((16, 16), Image.Resampling.LANCZOS)
    icon_16.save('e:\\speaklabs\\favicon-16x16.png')
    
    icon_sizes = [(16,16), (32, 32), (48, 48), (64,64)]
    img.save('e:\\speaklabs\\favicon.ico', format='ICO', sizes=icon_sizes)
    print("Created high quality S favicon!")

if __name__ == '__main__':
    main()
