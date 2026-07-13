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
        # Load the high-res apple-touch-icon or try the image itself
        img = Image.open('e:\\speaklabs\\apple-touch-icon.png').convert("RGBA")
        
        # Calculate radius (usually 20% of the image size looks good for squircle/iOS style)
        radius = int(img.width * 0.22)
        
        # Add rounded corners
        rounded = add_rounded_corners(img, radius)
        
        # Save as 32x32 PNG
        icon_32 = rounded.resize((32, 32), Image.Resampling.LANCZOS)
        icon_32.save('e:\\speaklabs\\favicon-32x32.png')
        
        # Save as 16x16 PNG
        icon_16 = rounded.resize((16, 16), Image.Resampling.LANCZOS)
        icon_16.save('e:\\speaklabs\\favicon-16x16.png')
        
        # Save as ICO (with multiple sizes)
        icon_sizes = [(16,16), (32, 32), (48, 48), (64,64)]
        rounded.save('e:\\speaklabs\\favicon.ico', format='ICO', sizes=icon_sizes)
        
        # Update apple-touch-icon itself
        icon_180 = rounded.resize((180, 180), Image.Resampling.LANCZOS)
        icon_180.save('e:\\speaklabs\\apple-touch-icon.png')
        
        print("Successfully generated rounded favicons!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    main()
