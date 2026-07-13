import os
from PIL import Image, ImageDraw

def add_rounded_corners(im, rad):
    circle = Image.new('L', (rad * 2, rad * 2), 0)
    draw = ImageDraw.Draw(circle)
    draw.ellipse((0, 0, rad * 2 - 1, rad * 2 - 1), fill=255)
    alpha = Image.new('L', im.size, 255)
    w, h = im.size
    alpha.paste(circle.crop((0, 0, rad, rad)), (0, 0))
    alpha.paste(circle.crop((0, rad, rad, rad * 2)), (0, h - rad))
    alpha.paste(circle.crop((rad, 0, rad * 2, rad)), (w - rad, 0))
    alpha.paste(circle.crop((rad, rad, rad * 2, rad * 2)), (w - rad, h - rad))
    im.putalpha(alpha)
    return im

def main():
    try:
        # Puraani "Pasted Image" file load karain (kyunki wo original thi)
        img_path = 'e:\\speaklabs\\Pasted Image'
        if not os.path.exists(img_path):
            print("Pasted Image not found!")
            return
            
        img = Image.open(img_path).convert("RGBA")
        
        # Convert to grayscale to find the text bounding box
        gray = img.convert('L')
        width, height = img.size
        
        # Scan to find the letter 's'
        # We assume black text on white background. Find pixels < 200
        min_x = width
        max_x = 0
        min_y = height
        max_y = 0
        
        # Find the very first black pixel from the left (start of 's')
        found_start = False
        for x in range(width):
            col_has_black = False
            for y in range(height):
                if gray.getpixel((x, y)) < 200:
                    col_has_black = True
                    if x < min_x: min_x = x
                    if x > max_x: max_x = x
                    if y < min_y: min_y = y
                    if y > max_y: max_y = y
            
            if col_has_black:
                found_start = True
            elif found_start:
                # We hit a white gap after finding black pixels. This is the end of the letter 's'!
                # But wait, some letters might have tiny gaps? Usually 's' is continuous.
                # Let's break to just isolate the first letter!
                break
                
        # Now we have the bounding box for 's': min_x, max_x, min_y, max_y
        s_width = max_x - min_x
        s_height = max_y - min_y
        
        # We want to crop a perfect square around the 's' with some padding
        # Let's add 40% padding
        pad = int(max(s_width, s_height) * 0.6)
        
        center_x = (min_x + max_x) // 2
        center_y = (min_y + max_y) // 2
        
        size = max(s_width, s_height) + pad * 2
        half_size = size // 2
        
        left = center_x - half_size
        top = center_y - half_size
        right = center_x + half_size
        bottom = center_y + half_size
        
        # Crop the square
        # First, create a solid white square to paste onto (in case we crop outside the image)
        square = Image.new('RGBA', (size, size), (255, 255, 255, 255))
        cropped = img.crop((left, top, right, bottom))
        square.paste(cropped, (0, 0))
        
        # Now apply rounded corners
        radius = int(size * 0.22)
        rounded = add_rounded_corners(square, radius)
        
        # Save favicons
        icon_32 = rounded.resize((32, 32), Image.Resampling.LANCZOS)
        icon_32.save('e:\\speaklabs\\favicon-32x32.png')
        
        icon_16 = rounded.resize((16, 16), Image.Resampling.LANCZOS)
        icon_16.save('e:\\speaklabs\\favicon-16x16.png')
        
        icon_sizes = [(16,16), (32, 32), (48, 48), (64,64)]
        rounded.save('e:\\speaklabs\\favicon.ico', format='ICO', sizes=icon_sizes)
        
        icon_180 = rounded.resize((180, 180), Image.Resampling.LANCZOS)
        icon_180.save('e:\\speaklabs\\apple-touch-icon.png')
        
        print(f"Success! Cropped S with box: {min_x},{min_y} to {max_x},{max_y}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    main()
